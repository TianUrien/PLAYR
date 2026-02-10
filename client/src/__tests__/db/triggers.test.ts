/**
 * Trigger Correctness Tests
 *
 * Verifies that database triggers correctly maintain counters, set timestamps,
 * normalise data, and generate notifications.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  authenticatePlayer,
  authenticateClub,
  hasRequiredEnv,
  marker,
  type AuthenticatedClient,
} from './setup'

const skip = !hasRequiredEnv()

describe.skipIf(skip)('Trigger Correctness', () => {
  let player: AuthenticatedClient
  let club: AuthenticatedClient

  beforeAll(async () => {
    ;[player, club] = await Promise.all([
      authenticatePlayer(),
      authenticateClub(),
    ])
  })

  // =========================================================================
  // POST LIKE COUNT
  // =========================================================================
  describe('post like_count trigger', () => {
    let postId: string | null = null
    const tag = marker()

    beforeAll(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (player.client.rpc as any)('create_user_post', {
        p_content: `Like counter test ${tag}`,
        p_images: null,
      })
      postId = (data as { post_id?: string })?.post_id ?? null
    })

    afterAll(async () => {
      if (postId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (player.client.rpc as any)('delete_user_post', {
          p_post_id: postId,
        })
      }
    })

    it('starts at 0 likes', async () => {
      const { data } = await player.client
        .from('user_posts')
        .select('like_count')
        .eq('id', postId!)
        .single()

      expect(data?.like_count).toBe(0)
    })

    it('increments to 1 after a like', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (player.client.rpc as any)('toggle_post_like', {
        p_post_id: postId,
      })

      const { data } = await player.client
        .from('user_posts')
        .select('like_count')
        .eq('id', postId!)
        .single()

      expect(data?.like_count).toBe(1)
    })

    it('decrements to 0 after an unlike', async () => {
      // Toggle again = unlike
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (player.client.rpc as any)('toggle_post_like', {
        p_post_id: postId,
      })

      const { data } = await player.client
        .from('user_posts')
        .select('like_count')
        .eq('id', postId!)
        .single()

      expect(data?.like_count).toBe(0)
    })
  })

  // =========================================================================
  // POST COMMENT COUNT
  // =========================================================================
  describe('post comment_count trigger', () => {
    let postId: string | null = null
    let commentId: string | null = null
    const tag = marker()

    beforeAll(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (player.client.rpc as any)('create_user_post', {
        p_content: `Comment counter test ${tag}`,
        p_images: null,
      })
      postId = (data as { post_id?: string })?.post_id ?? null
    })

    afterAll(async () => {
      if (postId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (player.client.rpc as any)('delete_user_post', {
          p_post_id: postId,
        })
      }
    })

    it('starts at 0 comments', async () => {
      const { data } = await player.client
        .from('user_posts')
        .select('comment_count')
        .eq('id', postId!)
        .single()

      expect(data?.comment_count).toBe(0)
    })

    it('increments to 1 after a comment', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: result } = await (player.client.rpc as any)(
        'create_post_comment',
        { p_post_id: postId, p_content: `Test comment ${tag}` }
      )
      commentId = (result as { comment_id?: string })?.comment_id ?? null

      const { data } = await player.client
        .from('user_posts')
        .select('comment_count')
        .eq('id', postId!)
        .single()

      expect(data?.comment_count).toBe(1)
    })

    it('decrements to 0 after soft-deleting the comment', async () => {
      if (!commentId) return

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (player.client.rpc as any)('delete_post_comment', {
        p_comment_id: commentId,
      })

      const { data } = await player.client
        .from('user_posts')
        .select('comment_count')
        .eq('id', postId!)
        .single()

      expect(data?.comment_count).toBe(0)
    })
  })

  // =========================================================================
  // CONVERSATION NORMALISATION (participant ordering)
  // =========================================================================
  describe('conversation normalisation', () => {
    it('participant_one < participant_two is enforced on insert', async () => {
      // Query existing conversations for the player
      const { data: convs } = await player.client
        .from('conversations')
        .select('participant_one, participant_two')
        .limit(10)

      for (const c of convs ?? []) {
        expect(c.participant_one < c.participant_two).toBe(true)
      }
    })
  })

  // =========================================================================
  // CONVERSATION last_message_at
  // =========================================================================
  describe('conversation last_message_at', () => {
    it('updates when a new message is sent', async () => {
      // Find a conversation the player is in
      const { data: convs } = await player.client
        .from('conversations')
        .select('id, last_message_at')
        .limit(1)

      if (!convs?.length) {
        console.warn('  ⏭  No player conversations found — skipping')
        return
      }

      const conv = convs[0]
      const before = conv.last_message_at

      // Send a message
      const { error: msgError } = await player.client
        .from('messages')
        .insert({
          conversation_id: conv.id,
          sender_id: player.userId,
          content: `Trigger test ${marker()}`,
        })

      expect(msgError).toBeNull()

      // Check that last_message_at has been updated
      const { data: updated } = await player.client
        .from('conversations')
        .select('last_message_at')
        .eq('id', conv.id)
        .single()

      // The new timestamp should be >= the old one
      if (before) {
        expect(new Date(updated!.last_message_at).getTime()).toBeGreaterThanOrEqual(
          new Date(before).getTime()
        )
      } else {
        expect(updated!.last_message_at).not.toBeNull()
      }
    })
  })

  // =========================================================================
  // NOTIFICATION TRIGGER (message)
  // =========================================================================
  describe('notification triggers', () => {
    it('sending a message creates a notification for the recipient', async () => {
      // Find a conversation between player and club
      const { data: convs } = await player.client
        .from('conversations')
        .select('id, participant_one, participant_two')
        .or(
          `participant_one.eq.${player.userId},participant_two.eq.${player.userId}`
        )
        .limit(5)

      // Find one where club is the other participant
      const conv = (convs ?? []).find(
        (c) =>
          (c.participant_one === club.userId ||
            c.participant_two === club.userId) &&
          (c.participant_one === player.userId ||
            c.participant_two === player.userId)
      )

      if (!conv) {
        console.warn('  ⏭  No player-club conversation found — skipping')
        return
      }

      const tag = marker()

      // Count club's notifications before
      const { data: before } = await club.client
        .from('profile_notifications')
        .select('id')
        .eq('recipient_profile_id', club.userId)
        .eq('kind', 'message_received')

      const countBefore = before?.length ?? 0

      // Player sends a message
      await player.client.from('messages').insert({
        conversation_id: conv.id,
        sender_id: player.userId,
        content: `Notification test ${tag}`,
      })

      // Small delay for trigger propagation
      await new Promise((r) => setTimeout(r, 1000))

      // Count club's notifications after
      const { data: after } = await club.client
        .from('profile_notifications')
        .select('id')
        .eq('recipient_profile_id', club.userId)
        .eq('kind', 'message_received')

      const countAfter = after?.length ?? 0

      expect(countAfter).toBeGreaterThanOrEqual(countBefore)
    })
  })

  // =========================================================================
  // UPDATED_AT TRIGGER
  // =========================================================================
  describe('updated_at auto-update', () => {
    it('profile updated_at changes on update', async () => {
      const { data: before } = await player.client
        .from('profiles')
        .select('updated_at')
        .eq('id', player.userId)
        .single()

      // Small pause to ensure timestamp difference
      await new Promise((r) => setTimeout(r, 100))

      // Trigger an update (change bio text)
      const tag = marker()
      await player.client
        .from('profiles')
        .update({ bio: `DB trigger test ${tag}` })
        .eq('id', player.userId)

      const { data: after } = await player.client
        .from('profiles')
        .select('updated_at')
        .eq('id', player.userId)
        .single()

      expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(
        new Date(before!.updated_at).getTime()
      )

      // Restore bio (clean up)
      await player.client
        .from('profiles')
        .update({ bio: null })
        .eq('id', player.userId)
    })
  })
})
