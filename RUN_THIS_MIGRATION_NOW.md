# 🚨 CRITICAL FIX REQUIRED

## ❌ Root Cause of Verification Failure

**The profiles table has NO automatic creation trigger!**

When users sign up:
1. ✅ Auth account created in `auth.users`
2. ❌ NO profile created in `profiles` table
3. ❌ User clicks verification link
4. ❌ AuthCallback tries to fetch profile → **NOT FOUND**
5. ❌ Error: "Profile not found. Please contact support."

---

## ✅ The Fix

**Migration Created:** `supabase/migrations/20251021000000_fix_profile_creation_trigger.sql`

**What it does:**
1. **Relaxes NOT NULL constraints** - Allows partial profiles
2. **Creates `handle_new_user()` function** - Auto-creates basic profile
3. **Creates `on_auth_user_created` trigger** - Runs on every signup

---

## 🔧 How to Apply (MUST DO NOW)

### Option 1: Supabase Dashboard (Easiest)

1. Go to https://supabase.com/dashboard
2. Select your project: **FIGMA PLAYR**
3. Click **SQL Editor** in left sidebar
4. Click **New Query**
5. Copy and paste this entire migration:

```sql
-- Fix profiles table for 2-step signup flow
-- 1. Remove NOT NULL constraints that prevent DB trigger from creating basic profile
-- 2. Add trigger to create profile automatically when user signs up

-- Step 1: Make fields optional (except id, email, role)
ALTER TABLE public.profiles 
  ALTER COLUMN full_name DROP NOT NULL,
  ALTER COLUMN base_location DROP NOT NULL,
  ALTER COLUMN nationality DROP NOT NULL;

-- Step 2: Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'player'),
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Create trigger on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Step 4: Grant necessary permissions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.profiles TO postgres, anon, authenticated, service_role;

COMMENT ON TRIGGER on_auth_user_created ON auth.users IS 
'Automatically creates a basic profile when a new user signs up. Profile is completed after email verification.';
```

6. Click **RUN** (bottom right)
7. ✅ Should see "Success. No rows returned"

---

### Option 2: Supabase CLI (If Installed)

```bash
cd "/Users/tianurien/Desktop/Code/PLAYR FIGMA"
supabase db push
```

---

## 🧪 Test After Migration

### 1. Clean Up Test Accounts

```sql
-- Run in Supabase SQL Editor
DELETE FROM auth.users WHERE email IN ('valturienzo@gmail.com', 'tian@kykuyo.com');
```

### 2. Test Fresh Sign-Up

1. Go to https://www.oplayr.com/signup
2. Sign up with a new email
3. Check Supabase → Authentication → Users
   - ✅ User should exist with `email_confirmed_at = NULL`
4. Check Supabase → Table Editor → profiles
   - ✅ Profile row should exist with:
     - `id` = user id
     - `email` = user email
     - `role` = selected role (player/coach/club)
     - `full_name` = NULL
5. Click verification link in email
6. ✅ Should see "Verifying your email..." then redirect to `/complete-profile`
7. ✅ Should see profile form (NOT role selection!)
8. Fill in details → Submit
9. ✅ Should redirect to `/dashboard/profile`

---

## 📊 Verify Trigger is Working

After running the migration, verify the trigger exists:

```sql
-- Check trigger exists
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

-- Should return:
-- trigger_name: on_auth_user_created
-- event_manipulation: INSERT
-- event_object_table: users
-- action_statement: EXECUTE FUNCTION public.handle_new_user()
```

---

## 🚨 IMPORTANT

**Run this migration IMMEDIATELY before testing again!**

Without this trigger:
- ❌ Every signup will fail at verification
- ❌ "Profile not found" error
- ❌ Users cannot complete signup

With this trigger:
- ✅ Profile auto-created on signup
- ✅ Verification works
- ✅ Users can complete profile
- ✅ Full flow works end-to-end

---

## 📁 Files Changed

- `supabase/migrations/20251021000000_fix_profile_creation_trigger.sql` - NEW
- `client/src/pages/AuthCallback.tsx` - Improved logging

**Commit:** `76386a0`  
**Status:** ✅ Code deployed, ⏳ Migration pending
