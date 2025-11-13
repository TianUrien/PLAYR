# Email Verification Setup Guide

This document explains the email verification implementation and how to configure it for different environments.

## Overview

Email verification is **required once at sign-up** to prove ownership of the email address. Verified users can sign in without re-verification unless they change their email.

## Flow Summary

1. **Sign-Up**: User creates account → verification email sent → redirected to `/verify-email`
2. **Verification**: User clicks link in email → email confirmed → session created → redirected to `/auth/callback`
3. **Profile Completion**: Callback checks if profile complete → routes to `/signup` (complete profile) or `/dashboard/profile`
4. **Sign-In**: Verified users sign in normally; unverified users see verification prompt with resend option

---

## Supabase Configuration (REQUIRED)

### 1. Enable Email Confirmation

Go to: **Supabase Dashboard → Authentication → Providers → Email**

- ✅ Enable **"Confirm email"** toggle
- ❌ Disable **"Mailer Autoconfirm"** (CRITICAL - must be OFF)
- ✅ Enable **"Secure email change"** (for future email changes)

### 2. Set Site URL

Go to: **Supabase Dashboard → Authentication → URL Configuration**

**Production:**
```
Site URL: https://www.oplayr.com
```

### 3. Add Redirect URLs

In the same **URL Configuration** section, add these **exact URLs** (no wildcards):

```
https://www.oplayr.com/auth/callback
http://localhost:5173/auth/callback
```

**For Vercel Preview Deployments:**
- Preview URLs are unique per branch/commit
- Add them manually as needed (see instructions below)

### 4. Email Template

Go to: **Supabase Dashboard → Authentication → Email Templates → Confirm Signup**

**Subject:** `Verify your email for PLAYR`

**Template** (default works fine):
- Must include `{{ .ConfirmationURL }}` placeholder
- Supabase automatically generates secure verification link

**Sender Name:** `PLAYR`

---

## Adding Vercel Preview URLs

Since Supabase doesn't support wildcards (`*.vercel.app`), you must add each preview URL manually:

### Step 1: Find Preview URL

After deploying to Vercel:
1. Go to Vercel Dashboard → Your Project → Deployments
2. Find your preview deployment
3. Copy the URL (e.g., `https://playr-figma-git-dev-tianurien.vercel.app`)

### Step 2: Add to Supabase

1. Go to Supabase Dashboard → Authentication → URL Configuration
2. Scroll to **"Additional Redirect URLs"**
3. Add your preview URL with `/auth/callback`:
   ```
   https://playr-figma-git-[branch]-[team].vercel.app/auth/callback
   ```
4. Click **Save**

### Common Preview URL Patterns

```
Main branch preview:
https://playr-figma-git-main-tianurien.vercel.app/auth/callback

Feature branch preview:
https://playr-figma-git-[branch-name]-tianurien.vercel.app/auth/callback

PR preview (auto-generated):
https://playr-figma-[hash].vercel.app/auth/callback
```

**Note:** You'll need to add each URL before testing email verification on that preview environment.

---

## Environment Variables

### Client (.env or Vercel Environment Variables)

```bash
# Supabase (already configured)
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

No additional variables needed for email verification.

---

## Testing Checklist

### Local Development

- [ ] Start dev server: `npm run dev`
- [ ] Go to `http://localhost:5173/signup`
- [ ] Create account with real email
- [ ] Verify you're redirected to `/verify-email`
- [ ] Check inbox for verification email
- [ ] Click link → should redirect to `http://localhost:5173/auth/callback`
- [ ] Should auto-redirect to `/signup` to complete profile
- [ ] Complete profile form
- [ ] Sign out and sign in → should work without re-verification

### Production

- [ ] Deploy to production
- [ ] Repeat all steps above on `https://www.oplayr.com`
- [ ] Verify callback works: `https://www.oplayr.com/auth/callback`

### Preview (Vercel)

- [ ] Deploy to preview branch
- [ ] Copy preview URL from Vercel dashboard
- [ ] Add `[preview-url]/auth/callback` to Supabase redirect URLs
- [ ] Test sign-up flow on preview URL
- [ ] Verify callback redirect works

---

## Troubleshooting

### "Invalid redirect URL" error

**Cause:** Callback URL not added to Supabase
**Fix:** Add the exact callback URL to Supabase → Auth → URL Configuration

### Verification email not received

**Causes:**
1. Email in spam folder
2. Supabase rate limit reached (default: 4 emails/hour on free tier)
3. Invalid email address

**Fix:**
- Check spam folder
- Wait an hour if rate limited
- Try different email provider

### "Email not confirmed" error on sign-in

**Expected behavior** for unverified users
**Fix:** User should click "Resend Verification Email" on `/verify-email` page

### Callback redirect loops

**Cause:** Profile completion check failing
**Debug:**
1. Check browser console for errors
2. Verify profiles table has row for user
3. Check if `full_name` is NULL (expected for new users)

### Link expired

**Causes:**
1. Link clicked more than once
2. Link older than 24 hours

**Fix:** Click "Resend Verification Email" button

---

## Database Trigger (Already in Place)

The existing database trigger creates a basic profile row when a user signs up:

```sql
-- This trigger already exists - no action needed
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'role'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

After verification, the user completes their profile, which **updates** this row with full details.

---

## Audit Unverified Users

To check for unverified users in your database, run the SQL script:

```bash
# See audit_unverified_users.sql
```

---

## Rollback Plan

If you need to disable email verification:

### Quick Disable (5 minutes)

1. Go to Supabase → Auth → Email
2. Toggle **"Confirm email"** to `OFF`
3. All new users will be auto-confirmed

### Verify Existing Unverified Users

```sql
-- Run this in Supabase SQL Editor
UPDATE auth.users 
SET email_confirmed_at = NOW() 
WHERE email_confirmed_at IS NULL;
```

---

## Support

**Common Issues:**
- Rate limiting → Wait 1 hour or upgrade Supabase plan
- Email deliverability → Configure custom SMTP or add SPF/DKIM records
- Preview URLs → Must add each one manually to Supabase

**Need Help?**
- Check Supabase Auth logs: Dashboard → Authentication → Logs
- Monitor email send success rate
- Review browser console for client-side errors

---

## Summary

✅ **One-time verification** at sign-up
✅ **No wildcards** - add each URL explicitly
✅ **Profile completion** happens after verification
✅ **Verified users** never re-verify (until email change)
✅ **Manual preview URL** management required

**Production domain:** `https://www.oplayr.com`
**Local dev:** `http://localhost:5173`
**Callback route:** `/auth/callback` (all environments)
