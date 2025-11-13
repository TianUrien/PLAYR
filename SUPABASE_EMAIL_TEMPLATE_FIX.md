# 🔧 Supabase Email Template Fix

## Problem
Verification links are not including tokens in the redirect URL.

## Root Cause
Supabase email template might be using the wrong confirmation URL format.

## Fix - Update Email Template in Supabase

### Step 1: Go to Supabase Dashboard
1. Open your Supabase project
2. Click **Authentication** in the sidebar
3. Click **Email Templates**
4. Click **Confirm signup** template

### Step 2: Check the Email Template

The template should use `{{ .ConfirmationURL }}` which automatically includes:
- The verification token
- Your configured redirect URL
- Proper PKCE parameters

**Current template should look like:**
```html
<h2>Confirm your signup</h2>

<p>Follow this link to confirm your user:</p>
<p><a href="{{ .ConfirmationURL }}">Confirm your mail</a></p>
```

### Step 3: If Using Custom Template

If you have a custom template, make sure it uses:
```html
<a href="{{ .ConfirmationURL }}">Confirm your email</a>
```

**DO NOT** manually construct the URL like:
```html
<!-- ❌ WRONG -->
<a href="{{ .SiteURL }}/auth/callback?token={{ .Token }}">
```

### Step 4: Save and Test

1. Click **Save**
2. Delete old test account:
   ```sql
   DELETE FROM auth.users WHERE email = 'tian@kykuyo.com';
   ```
3. Sign up with fresh email
4. Check the new verification email
5. Click the link

## Alternative: Check if PKCE is Actually Enabled

The issue might be that PKCE flow change requires clearing browser cache or the session.

### Quick Test:
1. Open **Incognito/Private window**
2. Go to https://www.oplayr.com/signup
3. Sign up with NEW email
4. Click verification link
5. Should work now with PKCE

## Debug: Check Email Link Format

When you receive the verification email, the link should be:

**Correct format (goes through Supabase first):**
```
https://[project-id].supabase.co/auth/v1/verify?token=xxx&type=signup&redirect_to=https://www.oplayr.com/auth/callback
```

This will then redirect to:
```
https://www.oplayr.com/auth/callback#access_token=xxx&refresh_token=yyy&...
```

If the email link goes DIRECTLY to:
```
https://www.oplayr.com/auth/callback
```

Then the email template is wrong.

## Expected Behavior After Fix

1. Click verification link in email
2. Browser goes to Supabase verification endpoint
3. Supabase validates token
4. Supabase redirects to: `https://www.oplayr.com/auth/callback#access_token=...`
5. AuthCallback detects tokens in hash
6. Creates session
7. Routes to /complete-profile ✅

