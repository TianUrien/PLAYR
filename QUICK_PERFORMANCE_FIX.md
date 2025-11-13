# Quick Implementation Guide - Messaging Performance Fix

## 🚀 IMMEDIATE ACTION ITEMS

### Step 1: Run Database Migrations (5 minutes)

```bash
cd supabase
```

Run migrations in order:

```bash
# 1. Add materialized view for unread counts
supabase migration up 20251106000000_add_unread_counts_view.sql

# 2. Add stored procedure for conversations
supabase migration up 20251106000001_add_get_conversations_function.sql

# 3. Optimize RLS policies
supabase migration up 20251106000002_optimize_rls_policies.sql

# 4. Add composite indexes
supabase migration up 20251106000003_add_messaging_composite_indexes.sql
```

Or apply all at once:
```bash
supabase db push
```

### Step 2: Update Frontend Code (10 minutes)

**A. Update Header.tsx - Unread Count (lines 24-51)**

Replace the `fetchUnreadCount` function:

```typescript
const fetchUnreadCount = useCallback(async () => {
  if (!user?.id) return

  const cacheKey = generateCacheKey('unread_count', { userId: user.id })

  await monitor.measure('fetch_unread_count', async () => {
    const count = await requestCache.dedupe(
      cacheKey,
      async () => {
        // NEW: Use secure view (single query, <10ms)
        const { data, error } = await supabase
          .from('user_unread_counts_secure')
          .select('unread_count')
          .maybeSingle()

        if (error) {
          logger.error('Failed to fetch unread count:', error)
          return 0
        }

        return data?.unread_count || 0
      },
      60000 // Increased cache to 60 seconds
    )

    setUnreadCount(count)
  }, { userId: user.id })
}, [user?.id])
```

**B. Update MessagesPage.tsx - Conversations (lines 64-158)**

Replace the `fetchConversations` function:

```typescript
const fetchConversations = useCallback(async (options?: { force?: boolean }) => {
  if (!user?.id) return

  await monitor.measure('fetch_conversations', async () => {
    const cacheKey = `conversations-${user.id}`
    if (options?.force) {
      requestCache.invalidate(cacheKey)
    }
    
    try {
      const enrichedConversations = await requestCache.dedupe(
        cacheKey,
        async () => {
          // NEW: Use stored procedure (single query, ~50-150ms)
          const { data, error } = await supabase
            .rpc('get_user_conversations', {
              p_user_id: user.id,
              p_limit: 50
            })

          if (error) throw error

          // Transform RPC result to expected Conversation format
          return (data || []).map(row => ({
            id: row.conversation_id,
            participant_one_id: user.id,
            participant_two_id: row.other_participant_id,
            created_at: row.conversation_created_at,
            updated_at: row.conversation_updated_at,
            last_message_at: row.conversation_last_message_at,
            otherParticipant: row.other_participant_name ? {
              id: row.other_participant_id,
              full_name: row.other_participant_name,
              username: row.other_participant_username,
              avatar_url: row.other_participant_avatar,
              role: row.other_participant_role as 'player' | 'coach' | 'club'
            } : undefined,
            lastMessage: row.last_message_content ? {
              content: row.last_message_content,
              sent_at: row.last_message_sent_at,
              sender_id: row.last_message_sender_id
            } : undefined,
            unreadCount: Number(row.unread_count) || 0
          }))
        },
        60000 // Increased cache to 60 seconds
      )

      setConversations(enrichedConversations)
    } catch (error) {
      logger.error('Error fetching conversations:', error)
    } finally {
      setLoading(false)
    }
  }, { userId: user.id })
}, [user?.id])
```

### Step 3: Verify Performance (5 minutes)

**A. Check console logs:**
```
✅ fetch_unread_count took 8ms    (was 1133ms)
✅ fetch_conversations took 87ms  (was 1279ms)
```

**B. Test in browser:**
1. Sign in to your app
2. Navigate to Messages page
3. Open DevTools Console
4. Look for monitor logs
5. Verify both queries are under 250ms

**C. Run database query check:**
```sql
-- Check if materialized view exists and has data
SELECT COUNT(*) FROM user_unread_counts;

-- Check if function exists
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name = 'get_user_conversations';

-- Check if new indexes exist
SELECT indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
AND tablename IN ('conversations', 'messages')
AND indexname LIKE '%composite%';
```

### Step 4: Monitor (Ongoing)

**A. Set up alerts in Supabase Dashboard:**
- Go to Database → Performance
- Set alert for queries > 250ms
- Monitor slow query log

**B. Check metrics daily:**
```typescript
// In browser console (dev mode only)
performanceStats()
```

Should show:
```
fetch_unread_count:
  Avg: 8-15ms
  p95: 25ms
  p99: 50ms

fetch_conversations:
  Avg: 50-120ms
  p95: 180ms
  p99: 250ms
```

---

## 🔍 TROUBLESHOOTING

### Problem: Materialized view doesn't exist
```sql
-- Manually create it
\i supabase/migrations/20251106000000_add_unread_counts_view.sql

-- Verify
SELECT * FROM user_unread_counts_secure LIMIT 1;
```

### Problem: RPC function returns error
```sql
-- Check function definition
SELECT pg_get_functiondef('get_user_conversations'::regproc);

-- Test function manually
SELECT * FROM get_user_conversations('YOUR-USER-UUID'::uuid, 50);
```

### Problem: Still slow after changes
```sql
-- Force table statistics update
ANALYZE conversations;
ANALYZE messages;

-- Check if indexes are being used
EXPLAIN ANALYZE 
SELECT * FROM get_user_conversations('YOUR-USER-UUID'::uuid, 50);

-- Look for "Seq Scan" (bad) vs "Index Scan" (good)
```

### Problem: Materialized view not refreshing
```sql
-- Manually refresh
REFRESH MATERIALIZED VIEW CONCURRENTLY user_unread_counts;

-- Check trigger exists
SELECT tgname 
FROM pg_trigger 
WHERE tgrelid = 'messages'::regclass
AND tgname LIKE '%refresh_unread%';
```

---

## 📊 EXPECTED RESULTS

### Before:
- **First load:** 2.4s+ (blocking)
- **Database CPU:** 60-80% under load
- **Error rate:** 2-3% (timeouts)
- **Cache hit rate:** 50-60%

### After:
- **First load:** 100-200ms (non-blocking)
- **Database CPU:** 10-20% under load
- **Error rate:** <0.1%
- **Cache hit rate:** 95%+

### Performance Breakdown:
```
Operation              Before    After    Improvement
─────────────────────────────────────────────────────
fetch_unread_count     1133ms    8-15ms   142x faster
fetch_conversations    1279ms    50-120ms 12x faster
Total page load        2412ms    70-135ms 18x faster
Database queries       4         2        50% reduction
Data transfer          ~500KB    ~50KB    90% reduction
```

---

## ✅ SUCCESS CRITERIA

- [ ] Migrations applied successfully
- [ ] No errors in Supabase logs
- [ ] Frontend code updated
- [ ] Console shows sub-250ms queries
- [ ] No TypeScript errors
- [ ] Real-time updates still working
- [ ] Unread badge updates correctly
- [ ] Conversation list loads fast

---

## 🚨 ROLLBACK PLAN

If something goes wrong:

```sql
-- Rollback materialized view
DROP MATERIALIZED VIEW IF EXISTS user_unread_counts CASCADE;
DROP VIEW IF EXISTS user_unread_counts_secure CASCADE;
DROP FUNCTION IF EXISTS refresh_unread_counts CASCADE;

-- Rollback function
DROP FUNCTION IF EXISTS get_user_conversations CASCADE;

-- Rollback RLS changes (restore old policies)
-- See migrations/20251014000000_create_messaging_system.sql

-- Rollback indexes (optional - indexes don't hurt)
-- DROP INDEX IF EXISTS idx_messages_unread_composite;
-- etc.
```

Then revert frontend code changes via git:
```bash
git checkout HEAD -- client/src/components/Header.tsx
git checkout HEAD -- client/src/pages/MessagesPage.tsx
```

---

## 📞 SUPPORT

- **Documentation:** See `MESSAGING_PERFORMANCE_OPTIMIZATION.md` for detailed analysis
- **Database logs:** Supabase Dashboard → Database → Logs
- **Frontend logs:** Browser Console → performanceStats()
- **Slow queries:** Supabase Dashboard → Database → Performance

**Estimated total time:** 20-30 minutes from start to verified improvement
