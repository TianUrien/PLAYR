# Fix: access_denied Error During Email Verification

## 🔴 Problem
Getting `https://www.oplayr.com/verify-email?error=access_denied` when clicking email verification link.

## 🎯 Root Cause
The redirect URL `http://localhost:5173/auth/callback` is not configured in your Supabase project settings.

## ✅ Solution (5 minutes)

### Step 1: Add Redirect URL to Supabase

1. Go to: https://supabase.com/dashboard/project/xtertgftujnebubxgqit/auth/url-configuration

2. Under **"Redirect URLs"**, add these URLs:
   ```
   http://localhost:5173/auth/callback
   http://localhost:5173/*
   https://www.oplayr.com/auth/callback
   https://www.oplayr.com/*
   ```

3. Click **"Save"**

### Step 2: Verify Site URL

1. In the same page, check **"Site URL"** is set to:
   ```
   http://localhost:5173
   ```
   (or `https://www.oplayr.com` for production)

2. Click **"Save"**

### Step 3: Test Again

1. **Delete the old verification email** (it's now invalid)

2. Go to: http://localhost:5173

3. Sign up with a **NEW email address** (or use "Resend Verification Email")

4. Click the verification link in the new email

5. You should now see:
   - ✅ Quick redirect (2-3 seconds)
   - ✅ No access_denied error
   - ✅ Lands on Complete Profile page

---

## 🔍 Why This Happens

Supabase checks that the redirect URL in the verification link matches one of your configured URLs. If it doesn't match, you get `access_denied`.

**Your current setup:**
- Verification link points to: `http://localhost:5173/auth/callback`
- Supabase allowed URLs: ❌ Not configured (only has production URL)

**After fix:**
- Verification link points to: `http://localhost:5173/auth/callback`
- Supabase allowed URLs: ✅ Matches `http://localhost:5173/*`

---

## 🚨 Alternative Quick Fix (if you can't access Supabase dashboard right now)

Test with production URL instead:

1. Push your changes to GitHub (so they're on production)

2. Go to: https://www.oplayr.com

3. Sign up with a test email

4. The verification link will use the production URL (which is already configured)

---

## 📋 Checklist

- [ ] Add `http://localhost:5173/*` to Supabase Redirect URLs
- [ ] Add `http://localhost:5173/auth/callback` to Supabase Redirect URLs
- [ ] Save changes in Supabase dashboard
- [ ] Get a NEW verification email (old one is expired/invalid)
- [ ] Click the link in the NEW email
- [ ] Should work now! ✅

---

## 🔗 Supabase Dashboard Link

Direct link to fix this:
https://supabase.com/dashboard/project/xtertgftujnebubxgqit/auth/url-configuration

---

## 💡 Pro Tip

After adding the URLs, wait 30 seconds for Supabase to update the configuration, then request a new verification email.
