# 🔧 Database Migrations - Quick Apply Guide

## Apply These Migrations in Supabase SQL Editor

**Link:** https://supabase.com/dashboard/project/xtertgftujnebubxgqit/sql

---

## Migration 1: Create Vacancy Applications Table

**File:** `supabase/migrations/20251011235900_create_vacancy_applications.sql`

**What it does:**
- Creates `vacancy_applications` table
- Adds status enum (pending, reviewed, shortlisted, interview, accepted, rejected, withdrawn)
- Sets up RLS policies for clubs and players
- Creates indexes for performance

**Run this first!**

---

## Migration 2: Add Username to Profiles

**File:** `supabase/migrations/20251012000000_add_username_to_profiles.sql`

**What it does:**
- Adds `username` column to profiles table
- Makes it unique and case-insensitive
- Adds format validation (3-30 chars, alphanumeric/hyphens/underscores)

**Run this second!**

---

## After Applying Migrations

### Add Usernames to Existing Profiles (Optional)

If you have existing profiles without usernames, run this in SQL Editor:

```sql
-- Auto-generate usernames from full names
UPDATE profiles 
SET username = LOWER(REPLACE(REPLACE(full_name, ' ', '-'), '.', ''))
WHERE username IS NULL;

-- Check for duplicates (if any)
SELECT username, COUNT(*) 
FROM profiles 
WHERE username IS NOT NULL
GROUP BY username 
HAVING COUNT(*) > 1;

-- Manually fix duplicates if needed
UPDATE profiles SET username = 'unique-username-here' WHERE id = 'user-id-here';
```

---

## Verify Migrations Worked

Run these queries to check:

```sql
-- Check vacancy_applications table exists
SELECT COUNT(*) FROM vacancy_applications;

-- Check username column exists
SELECT id, full_name, username, role FROM profiles LIMIT 5;

-- Test RLS policies (run as different users)
SELECT * FROM vacancy_applications;
```

---

## Test Application Flow

### 1. As a Player (Create Application)
```sql
-- Manually insert a test application
INSERT INTO vacancy_applications (vacancy_id, player_id, cover_letter)
VALUES (
  'vacancy-uuid-here',
  'player-uuid-here',
  'I am very interested in this position...'
);
```

### 2. As a Club (View Applications)
```sql
-- Check applicants count for a vacancy
SELECT COUNT(*) 
FROM vacancy_applications 
WHERE vacancy_id = 'your-vacancy-uuid';

-- View applicants with player info
SELECT 
  va.*,
  p.full_name,
  p.position,
  p.base_location
FROM vacancy_applications va
JOIN profiles p ON p.id = va.player_id
WHERE va.vacancy_id = 'your-vacancy-uuid'
ORDER BY va.applied_at DESC;
```

---

## Troubleshooting

### Error: "relation vacancy_applications does not exist"
- Migration 1 wasn't applied. Copy and run the first migration file.

### Error: "column username does not exist"
- Migration 2 wasn't applied. Copy and run the second migration file.

### RLS Error: "new row violates row-level security policy"
- Check you're signed in with correct role (player/club)
- Verify user IDs match in the application

### Duplicate Username Error
- Usernames must be unique
- Check with: `SELECT username FROM profiles GROUP BY username HAVING COUNT(*) > 1`
- Fix manually or add number suffix: `john-doe-2`

---

## 🎯 Quick Success Test

After migrations, this should work:

1. Go to your club dashboard → Vacancies tab
2. You should see "👥 0 Applicants" on open vacancies
3. Click it → should navigate to applicants list (empty for now)
4. Visit `/players/username` or `/clubs/username` → public profiles work

---

## Need Help?

If migrations fail:
1. Check Supabase logs: https://supabase.com/dashboard/project/xtertgftujnebubxgqit/logs
2. Verify you have correct permissions
3. Try running migrations one at a time
4. Check for syntax errors in SQL Editor

---

**All Set! 🚀** Your database is ready for the Player ↔ Club vacancy flow.
