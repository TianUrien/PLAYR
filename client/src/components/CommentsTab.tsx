import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { MessageSquare, MessageSquarePlus, Send, ShieldAlert, UserCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'
import type { Profile } from '@/lib/supabase'
import { useAuthStore } from '@/lib/auth'
import { useToastStore } from '@/lib/toast'
import Avatar from './Avatar'
import { cn } from '@/lib/utils'

interface CommentsTabProps {
  profileId: string
}

type CommentRating = Database['public']['Enums']['comment_rating']
type CommentRow = Database['public']['Tables']['profile_comments']['Row']

type CommentWithAuthor = CommentRow & {
  author: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'role' | 'username'> | null
}

const MAX_LENGTH = 1000
const MIN_LENGTH = 10

const ratingOptions: { value: CommentRating; label: string; description: string; badgeClass: string }[] = [
  { value: 'positive', label: 'Positive', description: 'Highlight a standout quality or experience.', badgeClass: 'bg-green-100 text-green-700 border-green-200' },
  { value: 'neutral', label: 'Neutral', description: 'Share balanced, factual feedback.', badgeClass: 'bg-gray-100 text-gray-700 border-gray-200' },
  { value: 'negative', label: 'Needs Work', description: 'Flag concerns respectfully for moderators.', badgeClass: 'bg-red-100 text-red-700 border-red-200' },
]

export default function CommentsTab({ profileId }: CommentsTabProps) {
  const { profile: authProfile, user } = useAuthStore()
  const { addToast } = useToastStore()

  const [comments, setComments] = useState<CommentWithAuthor[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [content, setContent] = useState('')
  const [rating, setRating] = useState<CommentRating | ''>('')
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set())

  const canComment = Boolean(user && authProfile && authProfile.id !== profileId)

  const fetchComments = useCallback(async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('profile_comments')
      .select(`
        id,
        profile_id,
        author_profile_id,
        content,
        rating,
        status,
        created_at,
        updated_at,
        author:profiles!profile_comments_author_profile_id_fkey (
          id,
          full_name,
          avatar_url,
          role,
          username
        )
      `)
      .eq('profile_id', profileId)
      .eq('status', 'visible')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error loading comments', error)
      addToast('Failed to load comments. Please try again.', 'error')
    } else {
      setComments((data as CommentWithAuthor[]) ?? [])
    }

    setLoading(false)
  }, [addToast, profileId])

  const fetchFriendIds = useCallback(async () => {
    const { data, error } = await supabase
      .from('profile_friend_edges')
      .select('friend_id')
      .eq('profile_id', profileId)
      .eq('status', 'accepted')

    if (error) {
      console.error('Error loading friend relationships', error)
      return
    }

    const ids = new Set((data ?? []).map((row) => row.friend_id).filter((id): id is string => Boolean(id)))
    setFriendIds(ids)
  }, [profileId])

  useEffect(() => {
    void fetchComments()
  }, [fetchComments])

  useEffect(() => {
    void fetchFriendIds()
  }, [fetchFriendIds])

  const existingComment = useMemo(() => {
    if (!authProfile) return null
    return comments.find((comment) => comment.author_profile_id === authProfile.id) ?? null
  }, [comments, authProfile])

  useEffect(() => {
    if (!existingComment) {
      setContent('')
      setRating('')
      return
    }

    setContent(existingComment.content)
    setRating(existingComment.rating ?? '')
  }, [existingComment])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canComment || !authProfile) {
      addToast('You need to sign in with a profile to leave a comment.', 'error')
      return
    }

    const trimmed = content.trim()
    if (trimmed.length < MIN_LENGTH) {
      addToast(`Comments must be at least ${MIN_LENGTH} characters.`, 'error')
      return
    }

    setSubmitting(true)

    try {
      const payload = {
        content: trimmed,
        rating: rating || null,
        status: 'visible' as CommentRow['status'],
      }

      let updatedComment: CommentWithAuthor | null = null

      if (existingComment) {
        const { data, error } = await supabase
          .from('profile_comments')
          .update(payload)
          .eq('id', existingComment.id)
          .select(`
            *,
            author:profiles!profile_comments_author_profile_id_fkey (
              id,
              full_name,
              avatar_url,
              role,
              username
            )
          `)
          .single()

        if (error) throw error
        updatedComment = data as CommentWithAuthor
        addToast('Your comment was updated.', 'success')
      } else {
        const { data, error } = await supabase
          .from('profile_comments')
          .insert({
            profile_id: profileId,
            author_profile_id: authProfile.id,
            ...payload,
          })
          .select(`
            *,
            author:profiles!profile_comments_author_profile_id_fkey (
              id,
              full_name,
              avatar_url,
              role,
              username
            )
          `)
          .single()

        if (error) throw error
        updatedComment = data as CommentWithAuthor
        addToast('Thanks for sharing feedback!', 'success')
      }

      if (updatedComment) {
        setComments((prev) => {
          const others = prev.filter((comment) => comment.id !== updatedComment!.id)
          return [updatedComment!, ...others]
        })
      }
    } catch (error) {
      console.error('Failed to save comment', error)
      addToast('Unable to save your comment. Please try again.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const getInitials = (name?: string | null) => {
    if (!name) return '?'
    return name
      .trim()
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase())
      .slice(0, 2)
      .join('') || '?'
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Comments</h2>
            <p className="text-gray-600 text-sm">
              Professional testimonials from verified PLAYR members.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
            <MessageSquare className="h-4 w-4 text-[#6366f1]" />
            {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
          </div>
        </div>
      </section>

      {canComment ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-[#eef2ff] text-[#4f46e5] rounded-full p-2">
              <MessageSquarePlus className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Share your experience
              </p>
              <p className="text-xs text-gray-500">
                Be constructive and professional—your name appears publicly.
              </p>
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="comment-content" className="sr-only">
                Comment
              </label>
              <textarea
                id="comment-content"
                value={content}
                onChange={(event) => setContent(event.target.value.slice(0, MAX_LENGTH))}
                rows={4}
                placeholder="Tell clubs, coaches, and players why this profile stands out..."
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 focus:border-[#6366f1] focus:ring-[#6366f1]"
              />
              <div className="mt-1 flex justify-between text-xs text-gray-500">
                <span>Min {MIN_LENGTH} characters</span>
                <span>
                  {content.trim().length}/{MAX_LENGTH}
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {ratingOptions.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    'cursor-pointer rounded-xl border px-4 py-3 text-sm shadow-sm transition hover:border-[#6366f1] hover:shadow-md',
                    rating === option.value ? 'border-[#6366f1] bg-[#eef2ff] text-[#4f46e5]' : 'border-gray-200 bg-white text-gray-700'
                  )}
                >
                  <input
                    type="radio"
                    name="comment-rating"
                    value={option.value}
                    className="sr-only"
                    checked={rating === option.value}
                    onChange={() => setRating(option.value)}
                  />
                  <p className="font-semibold">{option.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{option.description}</p>
                </label>
              ))}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-gray-500">
                Comments follow community guidelines. Moderators may hide content that violates the code of conduct.
              </p>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition disabled:opacity-60"
              >
                {submitting ? 'Saving...' : existingComment ? 'Update Comment' : 'Post Comment'}
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-5 text-sm text-gray-600">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-gray-400" />
            {authProfile?.id === profileId ? (
              <p>You can&apos;t leave a comment on your own profile, but other members can.</p>
            ) : (
              <p>
                Sign in with a PLAYR profile to leave a public, attributed comment.
              </p>
            )}
          </div>
        </section>
      )}

      <section className="space-y-4">
        {loading ? (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="animate-pulse rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gray-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-1/3 rounded bg-gray-200" />
                    <div className="h-3 w-1/4 rounded bg-gray-100" />
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="h-3 w-full rounded bg-gray-100" />
                  <div className="h-3 w-2/3 rounded bg-gray-100" />
                </div>
              </div>
            ))}
          </div>
        ) : comments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center text-gray-500">
            <p className="text-base font-semibold text-gray-900 mb-2">No comments yet</p>
            <p className="text-sm">
              Be the first to share constructive feedback for this profile.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {comments.map((comment) => {
              const authorId = comment.author_profile_id
              const isFriend = Boolean(authorId && friendIds.has(authorId))

              return (
                <article key={comment.id} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                  <div className="flex items-start gap-3">
                    <Avatar
                      src={comment.author?.avatar_url}
                      initials={getInitials(comment.author?.full_name ?? comment.author?.username ?? null)}
                      size="md"
                    />
                    <div className="flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                          <p className="font-semibold text-gray-900">
                            {comment.author?.full_name || comment.author?.username || 'Former PLAYR member'}
                          </p>
                          <p className="text-xs uppercase tracking-wide text-gray-500">
                            {comment.author?.role ?? 'member'}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                          {isFriend && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                              <UserCheck className="h-3.5 w-3.5" />
                              Friend
                            </span>
                          )}
                          <span>
                            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                          </span>
                          {comment.rating && (
                            <span
                              className={cn(
                                'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize',
                                ratingOptions.find((option) => option.value === comment.rating)?.badgeClass ?? 'bg-gray-100 text-gray-700'
                              )}
                            >
                              {comment.rating}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-gray-700 whitespace-pre-line">
                        {comment.content}
                      </p>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
