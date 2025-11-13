# 🚀 Quick Start: Implementing Stability Improvements

This guide walks you through implementing the critical stability improvements for PLAYR. Follow these steps in order.

---

## ⚡ Step 1: Database Layer (30 minutes)

### 1.1 Apply Performance Indexes
```bash
# Push the new migration with indexes
cd supabase
supabase db push
```

**What this does:**
- ✅ Adds 15+ optimized indexes for common queries
- ✅ Prevents duplicate applications
- ✅ Normalizes conversation participants
- ✅ Adds version control for optimistic locking

**Verify:**
```sql
-- Run in Supabase SQL Editor
SELECT schemaname, tablename, indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
ORDER BY tablename, indexname;
```

### 1.2 Enable Connection Pooling
Already configured in `supabase/config.toml`:
```toml
[db.pooler]
enabled = true
pool_mode = "transaction"
default_pool_size = 20
max_client_conn = 100
```

---

## 🛡️ Step 2: Frontend Resilience (60 minutes)

### 2.1 Wrap App with Error Boundary

Update `client/src/main.tsx`:

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import ErrorBoundary from '@/components/ErrorBoundary'
import './globals.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
)
```

### 2.2 Add Monitoring to Critical Operations

Example: Update `client/src/lib/auth.ts`:

```typescript
import { monitor } from './monitor';
import { withRetry } from './retry';
import { requestCache, generateCacheKey } from './requestCache';

// In fetchProfile function:
fetchProfile: async (userId) => {
  try {
    const cacheKey = generateCacheKey('profile', { userId });
    
    const { data, error } = await monitor.measure(
      'fetch_profile',
      () => requestCache.dedupe(
        cacheKey,
        () => withRetry(
          () => supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single()
        )
      ),
      { userId }
    );
    
    if (error) throw error;
    set({ profile: data, error: null });
  } catch (error) {
    console.error('Fetch profile error:', error);
    set({ error: error as Error });
  }
}
```

### 2.3 Add Performance Monitoring Hook

Create `client/src/hooks/useSupabaseQuery.ts`:

```typescript
import { useEffect, useState } from 'react';
import { monitor } from '@/lib/monitor';
import { withRetry } from '@/lib/retry';
import { requestCache, generateCacheKey } from '@/lib/requestCache';

export function useSupabaseQuery<T>(
  key: string,
  query: () => Promise<{ data: T | null; error: Error | null }>,
  dependencies: unknown[] = []
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const cacheKey = generateCacheKey(key, { deps: dependencies });
        
        const result = await monitor.measure(
          key,
          () => requestCache.dedupe(
            cacheKey,
            () => withRetry(query)
          )
        );

        if (!cancelled) {
          if (result.error) throw result.error;
          setData(result.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err as Error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, dependencies);

  return { data, loading, error };
}
```

---

## 📊 Step 3: Add Monitoring Dashboard (30 minutes)

Create `client/src/components/DevTools.tsx`:

```typescript
import { useState } from 'react';
import { monitor } from '@/lib/monitor';

export default function DevTools() {
  const [show, setShow] = useState(false);
  
  // Only show in development
  if (import.meta.env.PROD) return null;

  const health = monitor.getHealthStatus();
  const statusColor = {
    healthy: 'bg-green-500',
    degraded: 'bg-yellow-500',
    unhealthy: 'bg-red-500',
  }[health.status];

  return (
    <>
      {/* Floating badge */}
      <button
        onClick={() => setShow(!show)}
        className={`fixed bottom-4 right-4 w-12 h-12 rounded-full ${statusColor} text-white shadow-lg z-50 flex items-center justify-center`}
      >
        📊
      </button>

      {/* Panel */}
      {show && (
        <div className="fixed bottom-20 right-4 w-80 bg-white rounded-lg shadow-xl z-50 p-4">
          <h3 className="font-bold mb-2">Performance Monitor</h3>
          <div className="space-y-2 text-sm">
            <div>Status: <span className={`font-bold ${statusColor.replace('bg-', 'text-')}`}>{health.status}</span></div>
            <div>P95 Latency: {health.p95Latency.toFixed(2)}ms</div>
            <div>Error Rate: {health.errorRate.toFixed(2)}%</div>
            <div>Slow Ops: {health.slowOperations}</div>
          </div>
          <button
            onClick={() => monitor.logAllStats()}
            className="mt-4 w-full py-2 bg-indigo-600 text-white rounded"
          >
            Log Stats to Console
          </button>
        </div>
      )}
    </>
  );
}
```

Add to `App.tsx`:

```typescript
import DevTools from '@/components/DevTools';

function App() {
  // ... existing code
  
  return (
    <BrowserRouter>
      <Routes>
        {/* ... routes */}
      </Routes>
      <DevTools />
    </BrowserRouter>
  );
}
```

---

## 🧪 Step 4: Load Testing (30 minutes)

### 4.1 Install k6 (Load Testing Tool)

```bash
# macOS
brew install k6

# Or download from https://k6.io/docs/getting-started/installation/
```

### 4.2 Create Load Test Script

Create `load-tests/basic-load-test.js`:

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 20 },   // Warm up
    { duration: '3m', target: 100 },  // Ramp to 100
    { duration: '5m', target: 200 },  // Ramp to 200
    { duration: '5m', target: 200 },  // Hold at 200
    { duration: '2m', target: 0 },    // Cool down
  ],
  thresholds: {
    http_req_duration: ['p(95)<400'],  // 95% under 400ms
    http_req_failed: ['rate<0.01'],     // <1% errors
  },
};

const API_URL = __ENV.VITE_SUPABASE_URL;
const API_KEY = __ENV.VITE_SUPABASE_ANON_KEY;

export default function () {
  // Test 1: Fetch vacancies
  const vacanciesRes = http.get(
    `${API_URL}/rest/v1/vacancies?status=eq.open&select=*`,
    {
      headers: {
        'apikey': API_KEY,
        'Content-Type': 'application/json',
      },
    }
  );

  check(vacanciesRes, {
    'vacancies status 200': (r) => r.status === 200,
    'vacancies under 400ms': (r) => r.timings.duration < 400,
  });

  sleep(1);

  // Test 2: Fetch profiles (simulate browsing)
  const profilesRes = http.get(
    `${API_URL}/rest/v1/profiles?role=eq.player&select=*&limit=10`,
    {
      headers: {
        'apikey': API_KEY,
        'Content-Type': 'application/json',
      },
    }
  );

  check(profilesRes, {
    'profiles status 200': (r) => r.status === 200,
    'profiles under 400ms': (r) => r.timings.duration < 400,
  });

  sleep(2);
}
```

### 4.3 Run Load Test

```bash
# Set environment variables
export VITE_SUPABASE_URL='your-supabase-url'
export VITE_SUPABASE_ANON_KEY='your-anon-key'

# Run test
k6 run load-tests/basic-load-test.js
```

---

## ✅ Verification Checklist

### After Implementation:

- [ ] **Database indexes applied** — Run `EXPLAIN ANALYZE` on key queries
- [ ] **Error boundary catches errors** — Test by throwing error in component
- [ ] **Monitoring shows metrics** — Check DevTools panel in dev mode
- [ ] **Cache prevents duplicate requests** — Check network tab for deduplication
- [ ] **Retries work on failures** — Simulate network error
- [ ] **Load test passes** — P95 < 400ms, errors < 1%

### Database Performance:

```sql
-- Check slow queries (run in Supabase SQL Editor)
SELECT 
  query,
  calls,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC
LIMIT 10;
```

### Frontend Performance:

```typescript
// In browser console
monitor.logAllStats();
monitor.getHealthStatus();
```

---

## 🚨 Common Issues & Fixes

### Issue: "Too many connections"
**Fix:** Increase `default_pool_size` in `config.toml`

### Issue: Slow queries after migration
**Fix:** Run `ANALYZE` on tables:
```sql
ANALYZE profiles;
ANALYZE vacancies;
ANALYZE messages;
```

### Issue: Cache not clearing after updates
**Fix:** Invalidate cache manually:
```typescript
import { requestCache } from '@/lib/requestCache';
requestCache.invalidate(/^profile/); // Pattern-based
requestCache.clear(); // Clear all
```

### Issue: Realtime subscriptions not cleaning up
**Fix:** Always return cleanup function:
```typescript
useEffect(() => {
  const channel = supabase.channel('my-channel');
  channel.subscribe();
  
  return () => {
    supabase.removeChannel(channel);
  };
}, []);
```

---

## 📈 Next Steps

1. **Week 1:** Implement Steps 1-3
2. **Week 2:** Run load tests, identify bottlenecks
3. **Week 3:** Add caching to more queries
4. **Week 4:** Final stress testing

---

## 🎯 Success Metrics

Track these in production:

- **P95 Latency:** Should stay under 400ms
- **Error Rate:** Should stay under 1%
- **Database CPU:** Should stay under 70%
- **Connection Pool:** Should not exhaust

Monitor in Supabase Dashboard → Database → Performance.

---

**Need Help?** Check the full plan in `LAUNCH_READINESS_PLAN.md`

