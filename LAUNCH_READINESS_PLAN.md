# 🚀 PLAYR Launch Readiness Plan — 200 Concurrent Users

**Goal:** Ensure PLAYR can handle 200 concurrent users with:
- **API Latency:** < 400ms (p95)
- **Error Rate:** < 1%
- **Zero data corruption or race conditions**
- **Smooth, responsive user experience**

---

## 📊 Current Architecture Assessment

### ✅ What's Already Strong
1. **RLS Policies** — All tables have Row Level Security enabled
2. **Database Indexes** — Core indexes exist on conversations, messages, profiles
3. **Type Safety** — TypeScript + Supabase types
4. **Auth State Management** — Zustand store with proper listeners
5. **Storage Buckets** — Configured for avatars and gallery

### ⚠️ Critical Vulnerabilities Identified

#### 1. **Database Performance Bottlenecks**
- Missing composite indexes for common query patterns
- No connection pooling configured
- No query result caching
- Potential N+1 queries in frontend components

#### 2. **Concurrency & Race Conditions**
- No optimistic locking on critical updates
- Profile updates could cause race conditions
- Message sending lacks idempotency
- Media uploads have no duplicate prevention

#### 3. **Auth & Session Management**
- Multiple auth state checks could cause conflicts
- No session refresh strategy
- Missing auth retry logic

#### 4. **Storage & Media**
- No file size validation at storage level
- Missing storage quota management
- No CDN configuration
- Unbounded concurrent uploads

#### 5. **Real-time & Subscriptions**
- Potential memory leaks from unmanaged subscriptions
- No reconnection strategy for realtime
- Missing subscription cleanup

#### 6. **Error Handling & Recovery**
- No global error boundary
- Missing network error recovery
- No user-facing error states

---

## 🎯 Strategic Implementation Plan

### Phase 1: Database Layer Hardening (CRITICAL)
**Impact:** High | **Risk:** Low | **Time:** 2-3 hours

#### 1.1 Add Missing Indexes
```sql
-- Composite indexes for common queries
CREATE INDEX idx_profiles_role_username ON profiles(role, username);
CREATE INDEX idx_vacancies_status_position ON vacancies(status, position, club_id);
CREATE INDEX idx_vacancy_apps_vacancy_status ON vacancy_applications(vacancy_id, status);
CREATE INDEX idx_gallery_photos_user_created ON gallery_photos(user_id, created_at DESC);
CREATE INDEX idx_playing_history_player_dates ON playing_history(player_id, start_date DESC);

-- Partial indexes for frequent filters
CREATE INDEX idx_vacancies_open ON vacancies(club_id, created_at DESC) WHERE status = 'open';
CREATE INDEX idx_messages_unread ON messages(conversation_id, sent_at DESC) WHERE read_at IS NULL;
```

#### 1.2 Optimize RLS Policies
- Review policy complexity (some use multiple EXISTS checks)
- Add policy caching where possible
- Simplify nested queries

#### 1.3 Enable Connection Pooling
```toml
# supabase/config.toml
[db.pooler]
enabled = true
pool_mode = "transaction"
default_pool_size = 20
max_client_conn = 100
```

---

### Phase 2: Concurrency Protection (CRITICAL)
**Impact:** High | **Risk:** Medium | **Time:** 3-4 hours

#### 2.1 Add Version Control for Critical Tables
```sql
-- Add version column for optimistic locking
ALTER TABLE profiles ADD COLUMN version INTEGER DEFAULT 1;
ALTER TABLE vacancies ADD COLUMN version INTEGER DEFAULT 1;

-- Update version on every update
CREATE OR REPLACE FUNCTION increment_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_version_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION increment_version();
```

#### 2.2 Add Idempotency Keys for Messages
```sql
ALTER TABLE messages ADD COLUMN idempotency_key TEXT UNIQUE;
CREATE INDEX idx_messages_idempotency ON messages(idempotency_key) WHERE idempotency_key IS NOT NULL;
```

#### 2.3 Add Unique Constraints to Prevent Duplicates
```sql
-- Prevent duplicate vacancy applications
CREATE UNIQUE INDEX idx_unique_application ON vacancy_applications(vacancy_id, applicant_id);

-- Ensure conversation uniqueness both ways
CREATE OR REPLACE FUNCTION normalize_conversation_participants()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.participant_one_id > NEW.participant_two_id THEN
    NEW.participant_one_id := NEW.participant_two_id;
    NEW.participant_two_id := OLD.participant_one_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

### Phase 3: Frontend Resilience (HIGH PRIORITY)
**Impact:** High | **Risk:** Low | **Time:** 4-5 hours

#### 3.1 Implement Request Deduplication
```typescript
// lib/queryCache.ts - Add request deduplication
import { create } from 'zustand';

interface InFlightRequest {
  promise: Promise<any>;
  timestamp: number;
}

const useRequestCache = create<{
  inFlight: Map<string, InFlightRequest>;
  get: (key: string) => Promise<any> | null;
  set: (key: string, promise: Promise<any>) => void;
  clear: (key: string) => void;
}>((set, get) => ({
  inFlight: new Map(),
  get: (key) => {
    const request = get().inFlight.get(key);
    if (request && Date.now() - request.timestamp < 5000) {
      return request.promise;
    }
    return null;
  },
  set: (key, promise) => {
    set((state) => {
      const newMap = new Map(state.inFlight);
      newMap.set(key, { promise, timestamp: Date.now() });
      return { inFlight: newMap };
    });
  },
  clear: (key) => {
    set((state) => {
      const newMap = new Map(state.inFlight);
      newMap.delete(key);
      return { inFlight: newMap };
    });
  },
}));
```

#### 3.2 Add Optimistic Updates with Rollback
```typescript
// lib/optimisticUpdates.ts
export async function withOptimisticUpdate<T>(
  optimisticValue: T,
  setter: (value: T) => void,
  mutation: () => Promise<T>
): Promise<T> {
  const previousValue = optimisticValue;
  
  try {
    // Apply optimistic update
    setter(optimisticValue);
    
    // Perform mutation
    const result = await mutation();
    
    // Update with real data
    setter(result);
    return result;
  } catch (error) {
    // Rollback on error
    setter(previousValue);
    throw error;
  }
}
```

#### 3.3 Add Global Error Boundary
```typescript
// components/ErrorBoundary.tsx
import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    // TODO: Send to monitoring service
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">Something went wrong</h2>
            <button 
              onClick={() => window.location.reload()}
              className="btn-primary"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

#### 3.4 Implement Exponential Backoff for Retries
```typescript
// lib/retry.ts
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError!;
}
```

---

### Phase 4: Auth & Session Reliability (HIGH PRIORITY)
**Impact:** Medium | **Risk:** Low | **Time:** 2-3 hours

#### 4.1 Improve Auth State Management
```typescript
// lib/auth.ts - Enhanced version
export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: true,
  error: null,
  
  setUser: (user) => set({ user, error: null }),
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  
  signOut: async () => {
    try {
      await supabase.auth.signOut();
      set({ user: null, profile: null, error: null });
    } catch (error) {
      console.error('Sign out error:', error);
      set({ error: error as Error });
    }
  },
  
  fetchProfile: async (userId) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()
      );
      
      if (error) throw error;
      set({ profile: data, error: null });
    } catch (error) {
      console.error('Fetch profile error:', error);
      set({ error: error as Error });
    }
  },
  
  refreshSession: async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      set({ user: data.user, error: null });
    } catch (error) {
      console.error('Session refresh error:', error);
      set({ error: error as Error });
    }
  }
}));

// Auto-refresh session before expiry
let refreshInterval: NodeJS.Timeout;

export const initializeAuth = () => {
  const { setUser, setProfile, setLoading, fetchProfile, refreshSession } = useAuthStore.getState();
  
  // Clear existing interval
  if (refreshInterval) clearInterval(refreshInterval);
  
  // Check current session
  supabase.auth.getSession().then(({ data: { session } }) => {
    setUser(session?.user ?? null);
    if (session?.user) {
      fetchProfile(session.user.id);
    }
    setLoading(false);
  });
  
  // Listen for auth changes
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    async (event, session) => {
      console.log('Auth event:', event);
      
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    }
  );
  
  // Refresh session every 45 minutes (before 1-hour expiry)
  refreshInterval = setInterval(() => {
    refreshSession();
  }, 45 * 60 * 1000);
  
  return () => {
    subscription.unsubscribe();
    clearInterval(refreshInterval);
  };
};
```

---

### Phase 5: Media Upload Optimization (MEDIUM PRIORITY)
**Impact:** Medium | **Risk:** Low | **Time:** 2-3 hours

#### 5.1 Add Client-Side File Validation
```typescript
// lib/fileValidation.ts
export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

export function validateImageFile(file: File): FileValidationResult {
  const MAX_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: 'Only JPG, PNG, and WebP images are allowed' };
  }
  
  if (file.size > MAX_SIZE) {
    return { valid: false, error: 'File size must be less than 5MB' };
  }
  
  return { valid: true };
}

export async function compressImage(file: File, maxWidth = 1920): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target?.result as string;
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(new File([blob], file.name, { type: file.type }));
            } else {
              reject(new Error('Failed to compress image'));
            }
          },
          file.type,
          0.9
        );
      };
      
      img.onerror = reject;
    };
    
    reader.onerror = reject;
  });
}
```

#### 5.2 Implement Upload Queue
```typescript
// lib/uploadQueue.ts
class UploadQueue {
  private queue: Array<() => Promise<any>> = [];
  private processing = 0;
  private maxConcurrent = 3;

  async add<T>(uploadFn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await uploadFn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      
      this.process();
    });
  }

  private async process() {
    if (this.processing >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.processing++;
    const uploadFn = this.queue.shift();
    
    if (uploadFn) {
      await uploadFn();
      this.processing--;
      this.process();
    }
  }
}

export const uploadQueue = new UploadQueue();
```

---

### Phase 6: Real-time & Subscriptions (MEDIUM PRIORITY)
**Impact:** Medium | **Risk:** Medium | **Time:** 2-3 hours

#### 6.1 Proper Subscription Management
```typescript
// hooks/useRealtimeSubscription.ts
import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export function useRealtimeSubscription(
  channelName: string,
  callback: (payload: any) => void,
  dependencies: any[] = []
) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    // Remove existing channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    // Create new channel
    const channel = supabase.channel(channelName);
    channelRef.current = channel;

    // Subscribe and handle connection
    channel
      .on('postgres_changes', { event: '*', schema: 'public' }, callback)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Subscribed to ${channelName}`);
        } else if (status === 'CLOSED') {
          console.log(`Channel ${channelName} closed`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`Channel ${channelName} error`);
          // Retry connection
          setTimeout(() => {
            channel.subscribe();
          }, 5000);
        }
      });

    // Cleanup
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, dependencies);
}
```

---

### Phase 7: Monitoring & Observability (HIGH PRIORITY)
**Impact:** High | **Risk:** Low | **Time:** 2-3 hours

#### 7.1 Add Performance Monitoring
```typescript
// lib/monitoring.ts
interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  success: boolean;
  error?: string;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private maxMetrics = 1000;

  async measure<T>(
    name: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const start = performance.now();
    const timestamp = Date.now();
    
    try {
      const result = await fn();
      const duration = performance.now() - start;
      
      this.recordMetric({
        name,
        duration,
        timestamp,
        success: true
      });
      
      // Warn on slow operations
      if (duration > 1000) {
        console.warn(`Slow operation: ${name} took ${duration.toFixed(2)}ms`);
      }
      
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      
      this.recordMetric({
        name,
        duration,
        timestamp,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw error;
    }
  }

  private recordMetric(metric: PerformanceMetric) {
    this.metrics.push(metric);
    
    // Keep only recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }
  }

  getStats(operationName?: string) {
    const filtered = operationName
      ? this.metrics.filter(m => m.name === operationName)
      : this.metrics;

    if (filtered.length === 0) return null;

    const durations = filtered.map(m => m.duration).sort((a, b) => a - b);
    const successCount = filtered.filter(m => m.success).length;

    return {
      count: filtered.length,
      successRate: (successCount / filtered.length) * 100,
      avg: durations.reduce((a, b) => a + b, 0) / durations.length,
      p50: durations[Math.floor(durations.length * 0.5)],
      p95: durations[Math.floor(durations.length * 0.95)],
      p99: durations[Math.floor(durations.length * 0.99)],
      max: durations[durations.length - 1]
    };
  }

  logStats() {
    console.table(this.getStats());
  }
}

export const monitor = new PerformanceMonitor();

// Usage:
// const data = await monitor.measure('fetch_profile', () => supabase.from('profiles').select());
```

#### 7.2 Add Error Tracking
```typescript
// lib/errorTracking.ts
interface ErrorLog {
  message: string;
  stack?: string;
  context?: any;
  timestamp: number;
  userId?: string;
}

class ErrorTracker {
  private errors: ErrorLog[] = [];
  private maxErrors = 100;

  log(error: Error, context?: any) {
    const errorLog: ErrorLog = {
      message: error.message,
      stack: error.stack,
      context,
      timestamp: Date.now()
    };

    this.errors.push(errorLog);

    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    // Log to console
    console.error('Error tracked:', errorLog);

    // TODO: Send to external service (Sentry, LogRocket, etc.)
  }

  getRecentErrors(count = 10) {
    return this.errors.slice(-count);
  }

  clear() {
    this.errors = [];
  }
}

export const errorTracker = new ErrorTracker();
```

---

### Phase 8: Storage & CDN Configuration (LOW PRIORITY)
**Impact:** Medium | **Risk:** Low | **Time:** 1-2 hours

#### 8.1 Configure Storage Limits
```sql
-- Add storage quota check function
CREATE OR REPLACE FUNCTION check_user_storage_quota()
RETURNS TRIGGER AS $$
DECLARE
  user_storage_bytes bigint;
  max_storage_bytes bigint := 100 * 1024 * 1024; -- 100MB per user
BEGIN
  -- Calculate current storage for user
  SELECT COALESCE(SUM(octet_length(content)), 0)
  INTO user_storage_bytes
  FROM storage.objects
  WHERE owner = NEW.owner;

  IF user_storage_bytes + NEW.size > max_storage_bytes THEN
    RAISE EXCEPTION 'Storage quota exceeded. Maximum 100MB per user.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_storage_quota
  BEFORE INSERT ON storage.objects
  FOR EACH ROW
  EXECUTE FUNCTION check_user_storage_quota();
```

---

## 🧪 Testing Strategy

### Load Testing Checklist
- [ ] 200 simultaneous sign-ups
- [ ] 200 concurrent profile updates
- [ ] Simultaneous media uploads (50+ users)
- [ ] High-frequency messaging (100+ messages/sec)
- [ ] Concurrent vacancy applications
- [ ] Realtime subscription stress test

### Tools Recommended
1. **k6** or **Artillery** for load testing
2. **Supabase Dashboard** for monitoring
3. **Browser DevTools** for frontend profiling
4. **React DevTools Profiler** for component optimization

### Test Script Example (k6)
```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 50 },   // Ramp up to 50 users
    { duration: '5m', target: 200 },  // Ramp up to 200 users
    { duration: '10m', target: 200 }, // Stay at 200 users
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<400'], // 95% of requests under 400ms
    http_req_failed: ['rate<0.01'],    // Error rate under 1%
  },
};

export default function () {
  // Test profile fetch
  const res = http.get(`${__ENV.API_URL}/rest/v1/profiles`, {
    headers: {
      'apikey': __ENV.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${__ENV.USER_TOKEN}`,
    },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 400ms': (r) => r.timings.duration < 400,
  });

  sleep(1);
}
```

---

## 📋 Implementation Checklist

### Week 1: Critical Infrastructure
- [ ] Add database indexes (Phase 1.1)
- [ ] Enable connection pooling (Phase 1.3)
- [ ] Add concurrency protection (Phase 2)
- [ ] Implement error boundaries (Phase 3.3)
- [ ] Add auth session management (Phase 4)

### Week 2: Optimization & Resilience
- [ ] Request deduplication (Phase 3.1)
- [ ] Optimistic updates (Phase 3.2)
- [ ] Retry logic (Phase 3.4)
- [ ] File upload optimization (Phase 5)
- [ ] Subscription management (Phase 6)

### Week 3: Monitoring & Testing
- [ ] Add performance monitoring (Phase 7.1)
- [ ] Add error tracking (Phase 7.2)
- [ ] Run load tests
- [ ] Fix identified bottlenecks
- [ ] Document findings

### Week 4: Final Polish
- [ ] Storage quotas (Phase 8)
- [ ] Final performance audit
- [ ] Stress testing
- [ ] Launch preparation

---

## 🎯 Success Criteria

### Performance Targets
- ✅ **P95 latency < 400ms** for all API calls
- ✅ **Error rate < 1%** under 200 concurrent users
- ✅ **Zero race conditions** in concurrent operations
- ✅ **Zero data corruption** during stress tests

### User Experience Targets
- ✅ Smooth navigation (no jank or freezes)
- ✅ Instant feedback on all actions
- ✅ Graceful error recovery
- ✅ No duplicate submissions
- ✅ Fast media loading

### Reliability Targets
- ✅ Auth sessions persist correctly
- ✅ Realtime updates work reliably
- ✅ No memory leaks
- ✅ Proper cleanup on unmount

---

## 🚨 Red Flags to Watch For

1. **Database CPU > 80%** — Indicates missing indexes or inefficient queries
2. **Connection pool exhaustion** — Need to increase pool size or optimize queries
3. **Memory growth over time** — Indicates memory leaks (subscriptions, intervals)
4. **Slow response times (> 1s)** — RLS policies too complex or missing indexes
5. **High error rate on specific operations** — Race conditions or missing validation

---

## 🛠️ Tools & Resources

### Monitoring
- Supabase Dashboard (Database, Auth, Storage metrics)
- Browser DevTools (Network, Performance, Memory)
- React DevTools Profiler

### Testing
- k6 (load testing)
- Artillery (alternative load testing)
- Playwright (E2E testing)

### Optimization
- `EXPLAIN ANALYZE` for query optimization
- Lighthouse for frontend performance
- Bundle analyzer for code splitting

---

## 📞 Emergency Rollback Plan

If issues arise after deployment:

1. **Database**: Revert migrations using Supabase CLI
2. **Frontend**: Rollback to previous Vercel deployment
3. **Auth**: Check Supabase Auth logs for session issues
4. **Storage**: Monitor bucket usage in Supabase dashboard

---

## 🎉 Post-Launch Monitoring

### First 24 Hours
- Monitor error rates every hour
- Check database CPU and connection pool usage
- Review user-reported issues
- Track performance metrics

### First Week
- Daily performance reviews
- User feedback analysis
- Optimization opportunities
- Scale adjustments if needed

### First Month
- Weekly performance reports
- Cost analysis
- Feature usage analytics
- Plan for scale beyond 200 users

---

**Next Steps:** 
1. Review this plan
2. Prioritize phases based on current workload
3. Start with Phase 1 (Database Layer) — highest impact, lowest risk
4. Test each phase before moving to the next
5. Run full load test before launch

Ready to implement? Let me know which phase you'd like to start with! 🚀
