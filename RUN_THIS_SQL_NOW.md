# 🎯 FINAL MIGRATION - Run This in Supabase SQL Editor

**Copy and paste this EXACT SQL into Supabase Dashboard → SQL Editor → New Query → RUN**

```sql
-- Fix profiles table for 2-step signup flow
-- Remove NOT NULL constraints to allow partial profiles
-- Profile creation will be handled by the app code after email verification

-- Step 1: Make fields optional (except id, email, role)
ALTER TABLE public.profiles 
  ALTER COLUMN full_name DROP NOT NULL,
  ALTER COLUMN base_location DROP NOT NULL,
  ALTER COLUMN nationality DROP NOT NULL;

-- Step 2: Ensure proper permissions for profile creation
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO anon, authenticated;

-- Step 3: Make sure the INSERT policy allows creating profiles
-- This is for when CompleteProfile page creates the profile after verification
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Step 4: Ensure service_role can also insert (for migrations/admin)
GRANT ALL ON public.profiles TO service_role;

-- NOTE: No trigger on auth.users (permission denied by Supabase)
-- Instead, CompleteProfile page will create the profile on-the-fly if it doesn't exist
```

---

## ✅ Expected Result

You should see:
```
Success. No rows returned
```

---

## 🧪 Test After Running

1. **Delete test accounts:**
   ```sql
   DELETE FROM auth.users WHERE email IN ('valturienzo@gmail.com', 'tian@kykuyo.com');
   ```

2. **Sign up fresh:**
   - Go to https://www.oplayr.com/signup
   - Select role → Enter email + password
   - Submit

3. **Check inbox and click verification link**

4. **Expected flow:**
   - ✅ See "Verifying your email..." 
   - ✅ Redirect to /complete-profile
   - ✅ See profile form (NOT role selection)
   - ✅ Fill details → Submit
   - ✅ Redirect to /dashboard

---

## 📝 What This Does

1. **Relaxes NOT NULL constraints** - Allows partial profiles with null values
2. **Grants permissions** - Lets authenticated users create their own profiles
3. **Updates INSERT policy** - Allows users to insert profile where id = auth.uid()
4. **No trigger needed** - App creates profile on-the-fly when needed

---

## 🔍 How It Works Now

**User Flow:**
1. User signs up → Auth account created (no profile yet)
2. User clicks email link → Session established
3. AuthCallback redirects to /complete-profile
4. CompleteProfile checks for profile → Not found
5. **App creates basic profile** `{ id, email, role }`
6. Shows form to complete profile
7. User submits → **App updates profile** with full details
8. Redirects to dashboard ✅

**No database triggers = No permission issues!**

---

## ⚠️ After Migration

Code is already deployed (commit `54daec9`).  
Just run the SQL above and test!

---

**That's it! Run the SQL, then test the signup flow.** 🚀
