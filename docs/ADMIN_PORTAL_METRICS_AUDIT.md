# PLAYR Admin Portal Metrics Audit & Expansion Plan

**Date:** December 24, 2024  
**Status:** Analysis Complete  
**Author:** Copilot

---

## Executive Summary

This document provides a comprehensive audit of the current PLAYR Admin Portal metrics, identifies gaps, and proposes an expansion plan to maximize actionable KPIs while ensuring zero dashboard errors.

---

## 1. CURRENT METRICS INVENTORY

### 1.1 User Metrics Section

| Metric | Current Value Source | Formula | Time Range | Dedup Rules | Edge Cases |
|--------|---------------------|---------|------------|-------------|------------|
| **Total Users** | `profiles` table | `COUNT(*) FROM profiles WHERE NOT is_test_account` | All time | Excludes `is_test_account = true` | Blocked users ARE counted |
| **Players** | `profiles` table | `COUNT(*) FROM profiles WHERE role = 'player' AND NOT is_test_account` | All time | Excludes test accounts | N/A |
| **Coaches** | `profiles` table | `COUNT(*) FROM profiles WHERE role = 'coach' AND NOT is_test_account` | All time | Excludes test accounts | N/A |
| **Clubs** | `profiles` table | `COUNT(*) FROM profiles WHERE role = 'club' AND NOT is_test_account` | All time | Excludes test accounts | N/A |

**7d Delta Logic:**
- The UI shows a trend percentage comparing last 7 days signups vs. previous 7 days
- Formula: `((recent7d - previous7d) / previous7d * 100)`
- Calculated client-side from `admin_get_signup_trends(30)` results

**Validation Check:** ✅ `Total Users = Players + Coaches + Clubs` (confirmed: all use same filters)

---

### 1.2 Signups Section

| Metric | Formula | Time Range | Notes |
|--------|---------|------------|-------|
| **Last 7 Days** | `COUNT(*) FROM profiles WHERE created_at > now() - interval '7 days' AND NOT is_test_account` | Rolling 7d | Uses `created_at` from profiles (not auth.users) |
| **Last 30 Days** | `COUNT(*) FROM profiles WHERE created_at > now() - interval '30 days' AND NOT is_test_account` | Rolling 30d | Same logic |
| **Onboarding Complete** | `COUNT(*) FROM profiles WHERE onboarding_completed = true AND NOT is_test_account` | All time | Boolean flag set after questions flow |
| **Onboarding Pending** | `COUNT(*) FROM profiles WHERE onboarding_completed = false AND NOT is_test_account` | All time | Inverse of above |

**Edge Cases:**
- Users who created account but never completed questions have `onboarding_completed = false`
- If user deletes account, both auth.users and profiles are cascade deleted

---

### 1.3 Content Section

| Metric | Formula | Source Table | Notes |
|--------|---------|--------------|-------|
| **Total Vacancies** | `COUNT(*) FROM vacancies` | `vacancies` | Includes ALL statuses (draft, open, closed) |
| **Open Vacancies** | `COUNT(*) FROM vacancies WHERE status = 'open'` | `vacancies` | Currently accepting applications |
| **Total Applications** | `COUNT(*) FROM vacancy_applications` | `vacancy_applications` | All applications regardless of status |
| **Applications (7d)** | `COUNT(*) FROM vacancy_applications WHERE applied_at > now() - interval '7 days'` | `vacancy_applications` | Uses `applied_at` column |

**Additional stats available in backend but NOT shown in UI:**
- `closed_vacancies` - COUNT where status = 'closed'
- `draft_vacancies` - COUNT where status = 'draft'
- `vacancies_7d` - New vacancies created in last 7 days
- `pending_applications` - Applications with status = 'pending'

---

### 1.4 Engagement Section

| Metric | Formula | Source Table | Notes |
|--------|---------|--------------|-------|
| **Conversations** | `COUNT(*) FROM conversations` | `conversations` | All conversation threads |
| **Messages (7d)** | `COUNT(*) FROM messages WHERE sent_at > now() - interval '7 days'` | `messages` | Uses `sent_at` timestamp |
| **Friendships** | `COUNT(*) FROM profile_friendships WHERE status = 'accepted'` | `profile_friendships` | Only accepted, not pending/rejected |
| **Blocked Users** | `COUNT(*) FROM profiles WHERE is_blocked = true` | `profiles` | Admin-blocked profiles |

**Additional stats available but NOT shown:**
- `total_messages` - All-time message count

---

### 1.5 Data Health Section

| Metric | Formula | Risk Level | Description |
|--------|---------|------------|-------------|
| **Auth Orphans** | `COUNT(*) FROM auth.users au LEFT JOIN profiles p ON p.id = au.id WHERE p.id IS NULL` | 🔴 High | Auth users without profile records (signup failed mid-process) |
| **Profile Orphans** | `COUNT(*) FROM profiles p LEFT JOIN auth.users au ON au.id = p.id WHERE au.id IS NULL` | 🔴 High | Profile records without auth users (data corruption) |
| **Test Accounts** | `COUNT(*) FROM profiles WHERE is_test_account = true` | 🟡 Info | Accounts marked for testing |

**Click-through:** All three cards link to `/admin/data-issues` for detailed view and cleanup actions.

---

## 2. MISSING METRICS ANALYSIS

### 2.1 Vacancies & Applications (Core) - **HIGH PRIORITY**

| Proposed Metric | Feasibility | Data Source | Required Changes |
|-----------------|-------------|-------------|------------------|
| **Applications per vacancy (ranking)** | ✅ Possible now | `vacancy_applications` JOIN `vacancies` | New RPC + UI table |
| **Applicants list per vacancy** | ✅ Possible now | `vacancy_applications` JOIN `profiles` | New RPC + vacancy detail page |
| **Application status breakdown** | ✅ Possible now | `vacancy_applications.status` enum | Query by status grouping |
| **Time-to-first-application** | ✅ Possible now | `vacancies.published_at` vs first `applied_at` | New calculated metric |
| **Vacancy funnel: Views → Clicks → Apps** | ❌ NOT possible | No tracking exists | Requires `events` table |
| **Active clubs posting (7/30/90d)** | ✅ Possible now | `vacancies.club_id` + `created_at` | New RPC |
| **Repeat posting clubs** | ✅ Possible now | COUNT vacancies GROUP BY club_id | New RPC |

---

### 2.2 Clubs (Quality + Behavior) - **MEDIUM PRIORITY**

| Proposed Metric | Feasibility | Data Source | Required Changes |
|-----------------|-------------|-------------|------------------|
| **Clubs that posted vacancies** | ✅ Possible now | `SELECT DISTINCT club_id FROM vacancies` | Simple query |
| **Vacancies per club (distribution)** | ✅ Possible now | COUNT(*) GROUP BY club_id | New RPC + chart |
| **Clubs with high/low applicant volume** | ✅ Possible now | Aggregate applications by club | New RPC |
| **Club onboarding completion rate** | ✅ Possible now | Filter profiles by role='club' | Existing metric + role filter |

---

### 2.3 Players (Journey + Profile Completeness) - **HIGH PRIORITY**

| Proposed Metric | Feasibility | Data Source | Required Changes |
|-----------------|-------------|-------------|------------------|
| **Journey funnel stages** | ⚠️ Partial | Need to add `onboarding_completed_at`, `open_to_play` flag | Schema changes + tracking |
| **Profile completeness score distribution** | ✅ Possible now | Calculate from existing fields | New RPC (replicate useProfileStrength logic) |
| **Players with video highlight** | ✅ Possible now | `COUNT(*) WHERE highlight_video_url IS NOT NULL` | Simple query |
| **% players with video (of onboarded)** | ✅ Possible now | Ratio calculation | New RPC |
| **Players who stalled onboarding** | ⚠️ Partial | Need `onboarding_started_at` or step tracking | Schema changes |

**Current funnel stages trackable:**
1. ✅ Signed up (`profiles.created_at`)
2. ✅ Created profile (existence in `profiles`)
3. ✅ Onboarding complete (`onboarding_completed = true`)
4. ❌ "Open to Play" enabled (NO FIELD EXISTS)
5. ✅ Applied to vacancy (`vacancy_applications` exists)

---

### 2.4 Errors / Reliability - **MEDIUM PRIORITY**

| Proposed Metric | Feasibility | Data Source | Required Changes |
|-----------------|-------------|-------------|------------------|
| **Users who hit errors** | ❌ NOT possible | No error tracking | Requires `error_logs` table |
| **Signup failures** | ❌ NOT possible | No tracking | Requires event logging |
| **Onboarding save failures** | ❌ NOT possible | No tracking | Requires event logging |
| **Vacancy post failures** | ❌ NOT possible | No tracking | Requires event logging |
| **Application submit failures** | ❌ NOT possible | No tracking | Requires event logging |
| **Message send failures** | ⚠️ Partial | Could check idempotency_key patterns | Not reliable |
| **Error rate per flow** | ❌ NOT possible | No attempt tracking | Requires events table |

---

## 3. REQUIRED SCHEMA & TRACKING CHANGES

### 3.1 New `events` Table (Event Tracking)

```sql
-- Analytics event tracking for funnels and reliability metrics
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  role TEXT, -- Denormalized for faster analytics
  session_id TEXT, -- For session-level grouping
  entity_type TEXT, -- 'vacancy', 'application', 'profile', etc.
  entity_id UUID,
  properties JSONB DEFAULT '{}'::jsonb, -- Flexible event properties
  error_code TEXT, -- For error events
  error_message TEXT,
  user_agent TEXT,
  ip_hash TEXT, -- Hashed for privacy
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX events_event_name_idx ON public.events (event_name);
CREATE INDEX events_user_id_idx ON public.events (user_id);
CREATE INDEX events_entity_idx ON public.events (entity_type, entity_id);
CREATE INDEX events_created_at_idx ON public.events (created_at DESC);
CREATE INDEX events_error_code_idx ON public.events (error_code) WHERE error_code IS NOT NULL;

-- Partitioning recommended for production (monthly partitions)
COMMENT ON TABLE public.events IS 'Analytics events for funnel tracking and error monitoring';
```

**Key Events to Track:**

| Event Name | Entity Type | Properties | Purpose |
|------------|-------------|------------|---------|
| `signup.started` | profile | `{role, method}` | Funnel top |
| `signup.completed` | profile | `{role}` | Funnel conversion |
| `signup.failed` | profile | `{error_code, step}` | Error tracking |
| `onboarding.started` | profile | `{step}` | Journey tracking |
| `onboarding.step_completed` | profile | `{step, step_name}` | Drop-off analysis |
| `onboarding.completed` | profile | `{duration_seconds}` | Funnel end |
| `vacancy.viewed` | vacancy | `{referrer}` | Engagement funnel |
| `vacancy.apply_clicked` | vacancy | `{}` | Intent tracking |
| `vacancy.apply_completed` | vacancy | `{application_id}` | Conversion |
| `vacancy.apply_failed` | vacancy | `{error_code}` | Error tracking |
| `message.sent` | conversation | `{}` | Engagement |
| `message.failed` | conversation | `{error_code}` | Error tracking |

---

### 3.2 New `error_logs` Table (Reliability Monitoring)

```sql
-- Structured error logging from frontend and edge functions
CREATE TABLE public.error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL, -- 'frontend', 'edge_function', 'database'
  function_name TEXT, -- Edge function name or component
  error_type TEXT NOT NULL, -- 'validation', 'network', 'auth', 'database', 'unknown'
  error_code TEXT,
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  correlation_id TEXT, -- For request tracing
  request_path TEXT,
  request_method TEXT,
  request_body JSONB, -- Sanitized (no PII)
  metadata JSONB DEFAULT '{}'::jsonb,
  severity TEXT NOT NULL DEFAULT 'error', -- 'warning', 'error', 'critical'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX error_logs_source_idx ON public.error_logs (source);
CREATE INDEX error_logs_error_type_idx ON public.error_logs (error_type);
CREATE INDEX error_logs_user_id_idx ON public.error_logs (user_id);
CREATE INDEX error_logs_created_at_idx ON public.error_logs (created_at DESC);
CREATE INDEX error_logs_correlation_id_idx ON public.error_logs (correlation_id);

COMMENT ON TABLE public.error_logs IS 'Centralized error logging for reliability monitoring';
```

---

### 3.3 Schema Additions to Existing Tables

```sql
-- Add to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
  onboarding_started_at TIMESTAMPTZ;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
  onboarding_completed_at TIMESTAMPTZ;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
  open_to_opportunities BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
  last_active_at TIMESTAMPTZ;

-- Update existing trigger to set timestamps
CREATE OR REPLACE FUNCTION update_onboarding_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.onboarding_completed = false AND NEW.onboarding_completed = true THEN
    NEW.onboarding_completed_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_onboarding_timestamp
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_onboarding_timestamps();

-- Add to vacancies for view tracking (optional, if not using events table)
ALTER TABLE public.vacancies ADD COLUMN IF NOT EXISTS
  view_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.vacancies ADD COLUMN IF NOT EXISTS
  unique_view_count INTEGER NOT NULL DEFAULT 0;
```

---

## 4. ADMIN UI SPECIFICATION

### 4.1 New Admin Pages

#### 4.1.1 `/admin/vacancies` - Vacancy Management

**Purpose:** Overview of all vacancies with filtering and drill-down

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ Vacancy Management                           [Refresh] [Export]│
├─────────────────────────────────────────────────────────────┤
│ Filters: [Status ▾] [Club ▾] [Date Range ▾] [Country ▾]     │
├─────────────────────────────────────────────────────────────┤
│ Summary Cards:                                               │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐            │
│ │ Total   │ │ Open    │ │ Apps    │ │ Avg Apps │            │
│ │ 156     │ │ 42      │ │ 1,234   │ │ 7.9/vac  │            │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘            │
├─────────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────────────────┐│
│ │ Title          │ Club     │ Status │ Apps │ Created  │ ↗ ││
│ ├───────────────────────────────────────────────────────────┤│
│ │ Forward U21    │ FC Porto │ Open   │ 23   │ Dec 20   │ → ││
│ │ GK Coach       │ Ajax     │ Open   │ 8    │ Dec 18   │ → ││
│ │ Midfielder     │ PSV      │ Closed │ 45   │ Nov 30   │ → ││
│ └───────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

**Data Table Columns:**
- Title (link to detail)
- Club Name (link to club profile)
- Status (badge: draft/open/closed)
- Applications Count
- Location (city, country)
- Created Date
- Published Date
- Application Deadline
- Time-to-first-app (if applicable)

**Filters:**
- Status: All, Draft, Open, Closed
- Date Range: Last 7d, 30d, 90d, All time, Custom
- Club: Searchable dropdown
- Country: Dropdown from data

---

#### 4.1.2 `/admin/vacancies/:id` - Vacancy Detail

**Purpose:** Deep dive into single vacancy with applicants list

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ ← Back to Vacancies                                         │
│ Forward Player U21 - FC Porto                    [Edit] [Close]│
├─────────────────────────────────────────────────────────────┤
│ Details                    │ Statistics                      │
│ ─────────────────────────  │ ─────────────────────────       │
│ Status: 🟢 Open            │ Total Applications: 23          │
│ Position: Forward          │ Pending: 18                     │
│ Location: Porto, Portugal  │ Reviewed: 3                     │
│ Posted: Dec 20, 2024       │ Shortlisted: 2                  │
│ Deadline: Jan 15, 2025     │ Time to First App: 2h 15m       │
│ Club Contact: hr@fcporto.pt│ Avg Apps/Day: 4.6               │
├─────────────────────────────────────────────────────────────┤
│ Applicants (23)                                [Status ▾] [↓]│
│ ┌───────────────────────────────────────────────────────────┐│
│ │ Player       │ Nat │ Pos │ Status    │ Applied │ Profile ││
│ ├───────────────────────────────────────────────────────────┤│
│ │ João Silva   │ 🇧🇷  │ FWD │ Pending   │ Dec 23  │ View →  ││
│ │ Marco Rossi  │ 🇮🇹  │ FWD │ Shortlist │ Dec 22  │ View →  ││
│ └───────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

#### 4.1.3 `/admin/clubs` - Club Analytics

**Purpose:** Club activity and performance metrics

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ Club Analytics                               [Refresh] [Export]│
├─────────────────────────────────────────────────────────────┤
│ Summary:                                                     │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐             │
│ │ Total Clubs │ │ Active (30d)│ │ Posted Vac  │             │
│ │ 89          │ │ 34          │ │ 156         │             │
│ └─────────────┘ └─────────────┘ └─────────────┘             │
├─────────────────────────────────────────────────────────────┤
│ Top Posting Clubs (30d)                                      │
│ ┌───────────────────────────────────────────────────────────┐│
│ │ Club         │ Vacancies │ Applications │ Avg/Vac │ Rate ││
│ ├───────────────────────────────────────────────────────────┤│
│ │ FC Porto     │ 12        │ 156          │ 13.0    │ 85%  ││
│ │ Ajax         │ 8         │ 89           │ 11.1    │ 100% ││
│ └───────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────┤
│ Posting Frequency Distribution (Chart)                       │
│ [Bar chart: 0 posts, 1-2, 3-5, 6-10, 10+]                   │
└─────────────────────────────────────────────────────────────┘
```

---

#### 4.1.4 `/admin/players` - Player Analytics

**Purpose:** Player journey and profile completeness

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ Player Analytics                             [Refresh] [Export]│
├─────────────────────────────────────────────────────────────┤
│ Journey Funnel (Last 30d)                                    │
│ ┌───────────────────────────────────────────────────────────┐│
│ │ Signed Up       ████████████████████████████ 450 (100%)   ││
│ │ Onboarding Done ██████████████████████       380 (84%)    ││
│ │ Has Video       ████████████                 210 (47%)    ││
│ │ Applied to Vac  ████████                     156 (35%)    ││
│ └───────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────┤
│ Profile Completeness Distribution                            │
│ ┌───────────────────────────────────────────────────────────┐│
│ │ 0-25%  ██████                                    12%      ││
│ │ 26-50% ████████████                              24%      ││
│ │ 51-75% ██████████████████                        36%      ││
│ │ 76-100%████████████████                          28%      ││
│ └───────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────┤
│ Key Metrics:                                                 │
│ • Players with video highlight: 210 (47%)                    │
│ • Players who applied (ever): 312 (32%)                      │
│ • Avg applications per active player: 3.2                    │
│ • Players added to journey: 178 (40%)                        │
└─────────────────────────────────────────────────────────────┘
```

---

### 4.2 Enhanced Overview Dashboard Cards

Add these new cards to existing `/admin/overview`:

```tsx
// New section: "Vacancy Performance"
<section>
  <h2>Vacancy Performance</h2>
  <div className="grid grid-cols-4">
    <StatCard label="Vacancies (30d)" value={stats.vacancies_30d} />
    <StatCard label="Avg Apps/Vacancy" value={stats.avg_apps_per_vacancy} />
    <StatCard label="Active Clubs (30d)" value={stats.active_clubs_30d} />
    <StatCard label="Fill Rate" value={`${stats.vacancy_fill_rate}%`} />
  </div>
</section>

// New section: "Player Insights"
<section>
  <h2>Player Insights</h2>
  <div className="grid grid-cols-4">
    <StatCard label="With Video" value={stats.players_with_video} />
    <StatCard label="Applied (ever)" value={stats.players_applied} />
    <StatCard label="Avg Profile Score" value={`${stats.avg_profile_score}%`} />
    <StatCard label="Onboard Rate" value={`${stats.onboarding_rate}%`} />
  </div>
</section>
```

---

### 4.3 Global Filters Component

Add a reusable filter bar for date ranges:

```tsx
interface DateFilterProps {
  value: '7d' | '30d' | '90d' | 'all' | 'custom'
  onChange: (value: string, customRange?: { start: Date; end: Date }) => void
}

// Usage in all admin pages
<DateFilter value={dateRange} onChange={setDateRange} />
```

---

## 5. NEW RPC FUNCTIONS REQUIRED

### 5.1 Vacancy Analytics

```sql
-- Get vacancy list with application counts
CREATE OR REPLACE FUNCTION public.admin_get_vacancies(
  p_status vacancy_status DEFAULT NULL,
  p_club_id UUID DEFAULT NULL,
  p_days INTEGER DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  club_id UUID,
  club_name TEXT,
  status vacancy_status,
  location_city TEXT,
  location_country TEXT,
  application_count BIGINT,
  pending_count BIGINT,
  first_application_at TIMESTAMPTZ,
  time_to_first_app_minutes INTEGER,
  created_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  application_deadline DATE,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  RETURN QUERY
  WITH vacancy_stats AS (
    SELECT 
      v.id,
      COUNT(va.id) as app_count,
      COUNT(va.id) FILTER (WHERE va.status = 'pending') as pending_cnt,
      MIN(va.applied_at) as first_app
    FROM vacancies v
    LEFT JOIN vacancy_applications va ON va.vacancy_id = v.id
    GROUP BY v.id
  )
  SELECT 
    v.id,
    v.title,
    v.club_id,
    p.full_name as club_name,
    v.status,
    v.location_city,
    v.location_country,
    COALESCE(vs.app_count, 0),
    COALESCE(vs.pending_cnt, 0),
    vs.first_app,
    EXTRACT(EPOCH FROM (vs.first_app - v.published_at))::INTEGER / 60,
    v.created_at,
    v.published_at,
    v.application_deadline,
    COUNT(*) OVER() as total_count
  FROM vacancies v
  JOIN profiles p ON p.id = v.club_id
  LEFT JOIN vacancy_stats vs ON vs.id = v.id
  WHERE 
    (p_status IS NULL OR v.status = p_status)
    AND (p_club_id IS NULL OR v.club_id = p_club_id)
    AND (p_days IS NULL OR v.created_at > now() - (p_days || ' days')::INTERVAL)
  ORDER BY v.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Get applicants for a specific vacancy
CREATE OR REPLACE FUNCTION public.admin_get_vacancy_applicants(
  p_vacancy_id UUID,
  p_status application_status DEFAULT NULL
)
RETURNS TABLE (
  application_id UUID,
  player_id UUID,
  player_name TEXT,
  player_email TEXT,
  nationality TEXT,
  position TEXT,
  avatar_url TEXT,
  status application_status,
  applied_at TIMESTAMPTZ,
  cover_letter TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  RETURN QUERY
  SELECT 
    va.id,
    va.player_id,
    p.full_name,
    p.email,
    p.nationality,
    p.position,
    p.avatar_url,
    va.status,
    va.applied_at,
    va.cover_letter
  FROM vacancy_applications va
  JOIN profiles p ON p.id = va.player_id
  WHERE va.vacancy_id = p_vacancy_id
    AND (p_status IS NULL OR va.status = p_status)
  ORDER BY va.applied_at DESC;
END;
$$;
```

### 5.2 Club Analytics

```sql
-- Get club posting activity
CREATE OR REPLACE FUNCTION public.admin_get_club_activity(
  p_days INTEGER DEFAULT 30,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  club_id UUID,
  club_name TEXT,
  avatar_url TEXT,
  vacancy_count BIGINT,
  total_applications BIGINT,
  avg_apps_per_vacancy NUMERIC,
  last_posted_at TIMESTAMPTZ,
  onboarding_completed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  RETURN QUERY
  SELECT 
    p.id,
    p.full_name,
    p.avatar_url,
    COUNT(DISTINCT v.id),
    COUNT(va.id),
    ROUND(COUNT(va.id)::NUMERIC / NULLIF(COUNT(DISTINCT v.id), 0), 1),
    MAX(v.created_at),
    p.onboarding_completed
  FROM profiles p
  LEFT JOIN vacancies v ON v.club_id = p.id 
    AND (p_days IS NULL OR v.created_at > now() - (p_days || ' days')::INTERVAL)
  LEFT JOIN vacancy_applications va ON va.vacancy_id = v.id
  WHERE p.role = 'club' AND NOT p.is_test_account
  GROUP BY p.id
  HAVING COUNT(v.id) > 0
  ORDER BY COUNT(DISTINCT v.id) DESC
  LIMIT p_limit;
END;
$$;

-- Get active clubs count
CREATE OR REPLACE FUNCTION public.admin_get_active_clubs_count(
  p_days INTEGER DEFAULT 30
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  RETURN (
    SELECT COUNT(DISTINCT club_id)
    FROM vacancies
    WHERE created_at > now() - (p_days || ' days')::INTERVAL
  );
END;
$$;
```

### 5.3 Player Analytics

```sql
-- Get player funnel metrics
CREATE OR REPLACE FUNCTION public.admin_get_player_funnel(
  p_days INTEGER DEFAULT 30
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_date_filter TIMESTAMPTZ;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  v_date_filter := CASE WHEN p_days IS NULL THEN '-infinity'::TIMESTAMPTZ 
                        ELSE now() - (p_days || ' days')::INTERVAL END;
  
  SELECT json_build_object(
    'signed_up', (
      SELECT COUNT(*) FROM profiles 
      WHERE role = 'player' AND NOT is_test_account 
        AND created_at > v_date_filter
    ),
    'onboarding_completed', (
      SELECT COUNT(*) FROM profiles 
      WHERE role = 'player' AND NOT is_test_account 
        AND onboarding_completed = true
        AND created_at > v_date_filter
    ),
    'has_video', (
      SELECT COUNT(*) FROM profiles 
      WHERE role = 'player' AND NOT is_test_account 
        AND highlight_video_url IS NOT NULL
        AND created_at > v_date_filter
    ),
    'has_journey_entry', (
      SELECT COUNT(DISTINCT ph.user_id) FROM playing_history ph
      JOIN profiles p ON p.id = ph.user_id
      WHERE p.role = 'player' AND NOT p.is_test_account
        AND p.created_at > v_date_filter
    ),
    'applied_to_vacancy', (
      SELECT COUNT(DISTINCT va.player_id) FROM vacancy_applications va
      JOIN profiles p ON p.id = va.player_id
      WHERE p.role = 'player' AND NOT p.is_test_account
        AND p.created_at > v_date_filter
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Get profile completeness distribution
CREATE OR REPLACE FUNCTION public.admin_get_profile_completeness_distribution()
RETURNS TABLE (
  bucket TEXT,
  count BIGINT,
  percentage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  SELECT COUNT(*) INTO v_total 
  FROM profiles 
  WHERE role = 'player' AND NOT is_test_account;
  
  RETURN QUERY
  WITH scores AS (
    SELECT 
      p.id,
      (
        CASE WHEN p.nationality IS NOT NULL AND p.base_location IS NOT NULL AND p.position IS NOT NULL THEN 25 ELSE 0 END +
        CASE WHEN p.avatar_url IS NOT NULL THEN 20 ELSE 0 END +
        CASE WHEN p.highlight_video_url IS NOT NULL THEN 25 ELSE 0 END +
        CASE WHEN EXISTS (SELECT 1 FROM playing_history WHERE user_id = p.id) THEN 15 ELSE 0 END +
        CASE WHEN EXISTS (SELECT 1 FROM gallery_photos WHERE user_id = p.id) THEN 15 ELSE 0 END
      ) as score
    FROM profiles p
    WHERE p.role = 'player' AND NOT p.is_test_account
  )
  SELECT 
    bucket,
    cnt,
    ROUND(cnt::NUMERIC / NULLIF(v_total, 0) * 100, 1)
  FROM (
    SELECT 
      CASE 
        WHEN score <= 25 THEN '0-25%'
        WHEN score <= 50 THEN '26-50%'
        WHEN score <= 75 THEN '51-75%'
        ELSE '76-100%'
      END as bucket,
      COUNT(*) as cnt
    FROM scores
    GROUP BY 1
  ) bucketed
  ORDER BY bucket;
END;
$$;
```

### 5.4 Extended Dashboard Stats

```sql
-- Enhanced dashboard stats with new metrics
CREATE OR REPLACE FUNCTION public.admin_get_extended_dashboard_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats JSON;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT json_build_object(
    -- Existing metrics (from admin_get_dashboard_stats)
    'total_users', (SELECT COUNT(*) FROM profiles WHERE NOT is_test_account),
    'total_players', (SELECT COUNT(*) FROM profiles WHERE role = 'player' AND NOT is_test_account),
    'total_coaches', (SELECT COUNT(*) FROM profiles WHERE role = 'coach' AND NOT is_test_account),
    'total_clubs', (SELECT COUNT(*) FROM profiles WHERE role = 'club' AND NOT is_test_account),
    
    -- New vacancy metrics
    'vacancies_30d', (SELECT COUNT(*) FROM vacancies WHERE created_at > now() - interval '30 days'),
    'avg_apps_per_vacancy', (
      SELECT ROUND(AVG(app_count)::NUMERIC, 1)
      FROM (
        SELECT COUNT(va.id) as app_count
        FROM vacancies v
        LEFT JOIN vacancy_applications va ON va.vacancy_id = v.id
        WHERE v.status = 'open'
        GROUP BY v.id
      ) sub
    ),
    'active_clubs_30d', (
      SELECT COUNT(DISTINCT club_id) FROM vacancies 
      WHERE created_at > now() - interval '30 days'
    ),
    'vacancy_fill_rate', (
      SELECT ROUND(
        COUNT(*) FILTER (WHERE status = 'closed')::NUMERIC / 
        NULLIF(COUNT(*), 0) * 100, 0
      )
      FROM vacancies
      WHERE created_at > now() - interval '90 days'
    ),
    
    -- New player metrics
    'players_with_video', (
      SELECT COUNT(*) FROM profiles 
      WHERE role = 'player' AND NOT is_test_account 
        AND highlight_video_url IS NOT NULL
    ),
    'players_applied', (
      SELECT COUNT(DISTINCT player_id) FROM vacancy_applications
    ),
    'avg_profile_score', (
      SELECT ROUND(AVG(score)::NUMERIC, 0)
      FROM (
        SELECT 
          (
            CASE WHEN nationality IS NOT NULL AND base_location IS NOT NULL AND position IS NOT NULL THEN 25 ELSE 0 END +
            CASE WHEN avatar_url IS NOT NULL THEN 20 ELSE 0 END +
            CASE WHEN highlight_video_url IS NOT NULL THEN 25 ELSE 0 END
          ) as score
        FROM profiles
        WHERE role = 'player' AND NOT is_test_account
      ) sub
    ),
    'onboarding_rate', (
      SELECT ROUND(
        COUNT(*) FILTER (WHERE onboarding_completed)::NUMERIC / 
        NULLIF(COUNT(*), 0) * 100, 0
      )
      FROM profiles
      WHERE NOT is_test_account
    ),
    
    'generated_at', now()
  ) INTO v_stats;

  RETURN v_stats;
END;
$$;
```

---

## 6. VALIDATION & ERROR SAFEGUARDS

### 6.1 Null-Safe Query Patterns

All RPC functions use these patterns:

```sql
-- Always use COALESCE for counts
COALESCE(COUNT(*), 0)

-- Use NULLIF to prevent division by zero
ROUND(numerator::NUMERIC / NULLIF(denominator, 0) * 100, 1)

-- Use LEFT JOIN for optional relationships
LEFT JOIN vacancy_applications va ON va.vacancy_id = v.id

-- Filter NULLs explicitly
WHERE p.role IS NOT NULL
```

### 6.2 Validation Checks

Add these sanity checks to the Data Health page:

```sql
-- Add to admin_get_dashboard_stats or new validation function
'validation', json_build_object(
  'users_reconcile', (
    SELECT (
      (SELECT COUNT(*) FROM profiles WHERE role = 'player' AND NOT is_test_account) +
      (SELECT COUNT(*) FROM profiles WHERE role = 'coach' AND NOT is_test_account) +
      (SELECT COUNT(*) FROM profiles WHERE role = 'club' AND NOT is_test_account)
    ) = (SELECT COUNT(*) FROM profiles WHERE NOT is_test_account)
  ),
  'applications_have_valid_players', (
    SELECT NOT EXISTS (
      SELECT 1 FROM vacancy_applications va
      LEFT JOIN profiles p ON p.id = va.player_id
      WHERE p.id IS NULL
    )
  ),
  'applications_have_valid_vacancies', (
    SELECT NOT EXISTS (
      SELECT 1 FROM vacancy_applications va
      LEFT JOIN vacancies v ON v.id = va.vacancy_id
      WHERE v.id IS NULL
    )
  ),
  'vacancies_have_valid_clubs', (
    SELECT NOT EXISTS (
      SELECT 1 FROM vacancies v
      LEFT JOIN profiles p ON p.id = v.club_id
      WHERE p.id IS NULL
    )
  )
)
```

### 6.3 Health Check Alerts

```typescript
// client/src/features/admin/hooks/useHealthAlerts.ts
interface HealthAlert {
  id: string
  severity: 'warning' | 'critical'
  metric: string
  threshold: number
  currentValue: number
  message: string
}

const ALERT_THRESHOLDS = {
  auth_orphans: { warning: 5, critical: 20 },
  profile_orphans: { warning: 1, critical: 5 },
  signup_error_rate_7d: { warning: 5, critical: 15 }, // percentage
  application_error_rate_7d: { warning: 2, critical: 10 },
}
```

---

## 7. IMPLEMENTATION CHECKLIST

### Phase 1: Foundation (Week 1)
- [ ] Create migration for `events` table
- [ ] Create migration for `error_logs` table
- [ ] Add `onboarding_started_at`, `onboarding_completed_at` to profiles
- [ ] Add `open_to_opportunities` flag to profiles
- [ ] Deploy migrations to staging

### Phase 2: Backend (Week 2)
- [ ] Implement `admin_get_vacancies` RPC
- [ ] Implement `admin_get_vacancy_applicants` RPC
- [ ] Implement `admin_get_club_activity` RPC
- [ ] Implement `admin_get_player_funnel` RPC
- [ ] Implement `admin_get_profile_completeness_distribution` RPC
- [ ] Implement `admin_get_extended_dashboard_stats` RPC
- [ ] Add validation checks to existing functions
- [ ] Write unit tests for all new RPCs

### Phase 3: Frontend - Core Pages (Week 3)
- [ ] Create `AdminVacancies.tsx` page
- [ ] Create `AdminVacancyDetail.tsx` page
- [ ] Add vacancy routes to App.tsx
- [ ] Update AdminLayout with new nav items
- [ ] Create reusable DateFilter component
- [ ] Add vacancy stats cards to Overview

### Phase 4: Frontend - Analytics Pages (Week 4)
- [ ] Create `AdminClubs.tsx` analytics page
- [ ] Create `AdminPlayers.tsx` analytics page
- [ ] Add player funnel visualization component
- [ ] Add profile completeness chart
- [ ] Add club activity table

### Phase 5: Event Tracking (Week 5)
- [ ] Create `lib/analytics.ts` client-side event tracker
- [ ] Add signup events to auth flow
- [ ] Add onboarding step events
- [ ] Add vacancy view/apply events
- [ ] Add error boundary logging

### Phase 6: Testing & Polish (Week 6)
- [ ] E2E tests for new admin pages
- [ ] Performance testing on RPC functions (add indexes if needed)
- [ ] Add loading states and error boundaries
- [ ] Documentation update
- [ ] Deploy to production

---

## 8. APPENDIX

### A. Current Admin Routes

| Route | Component | Purpose |
|-------|-----------|---------|
| `/admin/overview` | AdminOverview | Dashboard with KPIs |
| `/admin/directory` | AdminDirectory | User search/management |
| `/admin/data-issues` | AdminDataIssues | Orphan cleanup |
| `/admin/audit-log` | AdminAuditLog | Action history |
| `/admin/settings` | AdminSettings | Platform settings |

### B. Proposed New Routes

| Route | Component | Purpose |
|-------|-----------|---------|
| `/admin/vacancies` | AdminVacancies | Vacancy list + filters |
| `/admin/vacancies/:id` | AdminVacancyDetail | Single vacancy + applicants |
| `/admin/clubs` | AdminClubs | Club activity analytics |
| `/admin/players` | AdminPlayers | Player journey analytics |
| `/admin/errors` | AdminErrors | Error monitoring (Phase 2) |

### C. Database Tables Summary

| Table | Current Usage | Admin Metrics From |
|-------|---------------|-------------------|
| `profiles` | All user data | User counts, roles, onboarding |
| `vacancies` | Club postings | Vacancy counts, status |
| `vacancy_applications` | Player apps | Application counts, status |
| `conversations` | DM threads | Engagement metrics |
| `messages` | Individual msgs | Message volume |
| `profile_friendships` | Connections | Friendship count |
| `playing_history` | Player journey | Journey completeness |
| `gallery_photos` | Player media | Media completeness |
| `events` (NEW) | Analytics | Funnels, errors |
| `error_logs` (NEW) | Errors | Reliability metrics |

---

*Document generated by Copilot analysis of PLAYR Admin Portal codebase.*
