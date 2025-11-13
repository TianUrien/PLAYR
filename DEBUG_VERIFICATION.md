# 🐛 Debug Email Verification Issue

## Problem
After clicking verification link, seeing "Verification Link Invalid" screen.

## Steps to Debug

### 1. Check the Email Link Format

Open the verification email and check the link. It should look like ONE of these:

**Option A - Direct Redirect (with tokens):**
```
https://www.oplayr.com/auth/callback#access_token=xxx&refresh_token=yyy&expires_in=3600&token_type=bearer&type=signup
```

**Option B - Supabase Redirect:**
```
https://[project-id].supabase.co/auth/v1/verify?token=xxx&type=signup&redirect_to=https://www.oplayr.com/auth/callback
```

### 2. If Option B (Supabase Redirect)

This means Supabase is handling the redirect. The link should:
1. Go to Supabase first
2. Verify the token
3. Redirect to your site WITH tokens in the hash

If you're seeing "Link Invalid", the redirect might be failing.

### 3. Check Supabase Configuration

Go to **Supabase Dashboard → Authentication → URL Configuration**:

**Site URL:** `https://www.oplayr.com`

**Redirect URLs (add both):**
```
https://www.oplayr.com/auth/callback
http://localhost:5173/auth/callback
```

❗ **CRITICAL:** If these aren't configured, Supabase will STRIP the tokens!

### 4. Check Browser Console

When you click the verification link, open DevTools (F12) and look for these logs:

```
AuthCallback loaded with hash: #access_token=... or (empty)
Has access_token: true/false
Has error: true/false
```

**If hash is empty:**
- Problem: Tokens are being stripped
- Cause: Redirect URL not allowlisted in Supabase
- Fix: Add URL to Supabase → Authentication → URL Configuration

**If hash has error:**
```
AuthCallback loaded with hash: #error=...&error_description=...
```
- Problem: Token validation failed on Supabase side
- Cause: Token expired, already used, or invalid
- Fix: Resend verification email

### 5. Test with Fresh Email

After configuring Supabase URLs:

1. Delete old test account in Supabase SQL Editor:
   ```sql
   DELETE FROM auth.users WHERE email = 'your-test-email@example.com';
   ```

2. Sign up again with FRESH email
3. Click NEW verification link
4. Check console logs

### 6. Check Supabase Email Template

Go to **Supabase Dashboard → Authentication → Email Templates**

**Confirm Email Template** should have:
```
{{ .ConfirmationURL }}
```

This variable should automatically include your redirect URL.

## Expected Flow

✅ **Correct Flow:**
1. Click verification link in email
2. Link goes to Supabase → validates token
3. Supabase redirects to: `https://www.oplayr.com/auth/callback#access_token=...`
4. AuthCallback sees tokens in hash
5. Creates session
6. Redirects to /complete-profile

❌ **Broken Flow:**
1. Click verification link
2. Link goes to Supabase → validates token
3. Supabase redirects to: `https://www.oplayr.com/auth/callback` (NO HASH)
4. AuthCallback sees empty hash
5. Thinks link is expired
6. Redirects to /verify-email?error=expired

## Next Steps

1. Check Supabase URL Configuration
2. Add redirect URLs if missing
3. Delete test accounts
4. Test with fresh email
5. Share console logs if still failing

