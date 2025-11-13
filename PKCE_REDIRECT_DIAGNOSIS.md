# 🔍 PKCE Flow & Redirect URL Diagnosis - October 30, 2025

## 🚨 Current Error

**URL:** `https://www.oplayr.com/verify-email?error=expired&reason=no_tokens&email=tian%40kykuyo.com`

**Error indicates:**
- ❌ No PKCE code (`?code=`) in callback URL
- ❌ No access tokens in hash (`#access_token=`)
- ❌ AuthCallback timeout triggered → redirected to error page

**This is NOT a race condition issue - the tokens never arrive at all.**

---

## 🔬 PKCE Flow Analysis

### How PKCE Should Work

```
1. User clicks "Create Account"
   ↓
2. App calls supabase.auth.signUp() with emailRedirectTo
   emailRedirectTo: "https://www.oplayr.com/auth/callback"
   ↓
3. Supabase sends verification email
   Link: https://[PROJECT].supabase.co/auth/v1/verify?token=XXX&type=signup&redirect_to=https://www.oplayr.com/auth/callback
   ↓
4. User clicks link in email
   ↓
5. Supabase verifies token server-side
   ↓
6. Supabase redirects to:
   https://www.oplayr.com/auth/callback?code=PKCE_CODE
   ↓
7. SDK detects ?code= parameter
   ↓
8. SDK exchanges code for session
   ↓
9. onAuthStateChange fires with SIGNED_IN
   ↓
10. User redirected to /complete-profile
```

### What's Actually Happening

```
1-4. ✅ Same as above
   ↓
5. ⚠️ Supabase verifies token
   ↓
6. ❌ Supabase redirects to:
   https://www.oplayr.com/auth/callback (NO CODE!)
   ↓
7. ❌ SDK finds nothing to process
   ↓
8. ⏱️ Timeout triggers after 5 seconds
   ↓
9. ❌ Redirect to /verify-email?error=expired&reason=no_tokens
```

---

## 🎯 Root Cause: Redirect URL Configuration

### Issue #1: Redirect URL Mismatch

**The Problem:**
Supabase validates redirect URLs **exactly**. Even small differences can cause the PKCE code to be stripped.

**Common mismatches:**
- ✅ App sends: `https://www.oplayr.com/auth/callback`
- ❌ Dashboard has: `https://oplayr.com/auth/callback` (missing www)
- ❌ Dashboard has: `http://www.oplayr.com/auth/callback` (http instead of https)
- ❌ Dashboard has: `https://www.oplayr.com/*` (wildcard instead of exact path)

**What happens:**
1. Supabase receives redirect_to with `www.oplayr.com`
2. Checks against allowed list: `oplayr.com` ❌ NO MATCH
3. **Security measure:** Strips PKCE code and redirects to URL without tokens
4. User lands on callback page with no code

---

### Issue #2: Site URL Configuration

**Site URL vs Redirect URLs:**
- **Site URL:** Your app's primary domain (used as fallback)
- **Redirect URLs:** Specific URLs allowed for OAuth callbacks

**Problem scenarios:**

#### Scenario A: Site URL has www, Redirect URL doesn't
```
Site URL: https://www.oplayr.com
Redirect URLs: https://oplayr.com/auth/callback
App sends: https://www.oplayr.com/auth/callback
Result: ❌ Mismatch → No code
```

#### Scenario B: Multiple domains, not all listed
```
Site URL: https://www.oplayr.com
Redirect URLs: https://www.oplayr.com/auth/callback
Email link might use: https://oplayr.com (depending on how Supabase generates it)
Result: ❌ Mismatch → No code
```

---

### Issue #3: PKCE Code Expiration

**PKCE codes are short-lived:**
- Generated when user clicks email link
- Valid for **5-10 minutes** (Supabase default)
- Can only be exchanged **once**

**Expiration scenarios:**
1. ✅ User clicks link → Code generated → Exchange within 5 min → Success
2. ❌ User clicks link → Waits 15 min → Code expired → No tokens
3. ❌ User clicks link twice → Second click uses same (consumed) code → No tokens

---

## 🔧 Diagnostic Steps

### Step 1: Check Email Link Format

**When you receive the verification email, inspect the link:**

**Expected format:**
```
https://[your-project-id].supabase.co/auth/v1/verify?token=abc123def456&type=signup&redirect_to=https://www.oplayr.com/auth/callback
```

**Check for:**
- ✅ Does it go through `supabase.co` first? (Yes = correct)
- ✅ Does `redirect_to` parameter match your app's URL exactly?
- ✅ Is `redirect_to` URL-encoded properly?
- ⚠️ Does it have `www.` in the domain?

**Test:** Copy the link and check the `redirect_to` value:
```bash
# In browser console or terminal:
decodeURIComponent("https%3A%2F%2Fwww.oplayr.com%2Fauth%2Fcallback")
# Should output: https://www.oplayr.com/auth/callback
```

---

### Step 2: Trace the Redirect

**Follow the redirect chain:**

1. **Copy verification link from email** (don't click yet)
2. **Paste into new incognito tab** with DevTools Network panel open
3. **Watch the redirects:**

**Expected chain:**
```
Request #1: https://[project].supabase.co/auth/v1/verify?token=...
  ↓ (302 redirect)
Request #2: https://www.oplayr.com/auth/callback?code=AUTHORIZATION_CODE
  ↓ (page loads)
Your app's AuthCallback page
```

**If you see:**
```
Request #1: https://[project].supabase.co/auth/v1/verify?token=...
  ↓ (302 redirect)
Request #2: https://www.oplayr.com/auth/callback (NO ?code=)
  ↓
Error page
```

Then the **redirect URL is not whitelisted** in Supabase.

---

### Step 3: Check Supabase Dashboard Configuration

**Go to Supabase Dashboard:**

#### A. Check Site URL
1. Open your Supabase project
2. Go to **Authentication** → **URL Configuration**
3. Check **Site URL** field

**Should be:**
```
https://www.oplayr.com
```

**Common mistakes:**
- ❌ `https://oplayr.com` (missing www)
- ❌ `https://www.oplayr.com/` (trailing slash might cause issues)
- ❌ `http://www.oplayr.com` (http instead of https)

#### B. Check Redirect URLs
1. Same page: **Redirect URLs** section
2. Check if it includes:

**Must have (for production):**
```
https://www.oplayr.com/auth/callback
https://www.oplayr.com/*
```

**Should also have (for local dev):**
```
http://localhost:5173/auth/callback
http://localhost:5173/*
```

**⚠️ CRITICAL:** You might need BOTH:
- `https://www.oplayr.com/auth/callback` (exact path)
- `https://oplayr.com/auth/callback` (without www - for compatibility)

#### C. Check Email Template
1. Go to **Authentication** → **Email Templates**
2. Click **Confirm signup**
3. Verify it uses: `{{ .ConfirmationURL }}`

**Should look like:**
```html
<p>Follow this link to confirm your user:</p>
<p><a href="{{ .ConfirmationURL }}">Confirm your mail</a></p>
```

**Should NOT be:**
```html
<!-- ❌ WRONG - manually constructed URL -->
<a href="{{ .SiteURL }}/auth/callback?token={{ .Token }}">
```

---

## ✅ Recommended Fix

### Fix #1: Add Both www and non-www Redirect URLs

**In Supabase Dashboard → Authentication → URL Configuration:**

**Site URL:**
```
https://www.oplayr.com
```

**Redirect URLs (add ALL of these):**
```
https://www.oplayr.com/auth/callback
https://www.oplayr.com/*
https://oplayr.com/auth/callback
https://oplayr.com/*
http://localhost:5173/auth/callback
http://localhost:5173/*
```

**Why both www and non-www?**
- Some browsers/systems might drop or add www
- Supabase might use Site URL domain for some redirects
- Belt-and-suspenders approach

---

### Fix #2: Update SignUp emailRedirectTo

**Ensure it matches Site URL exactly:**

```typescript
// In SignUp.tsx
const { data: authData, error: signUpError } = await supabase.auth.signUp({
  email: formData.email,
  password: formData.password,
  options: {
    emailRedirectTo: `${window.location.origin}/auth/callback`, // ← Dynamically uses current domain
    data: {
      role: selectedRole,
    }
  }
})
```

**This is already correct** ✅ - it uses `window.location.origin` which will be `https://www.oplayr.com`

---

### Fix #3: Add Fallback for Redirect Mismatch

**In AuthCallback.tsx, detect if code is missing and show better error:**

```typescript
// After 5s timeout, check WHY there's no code
if (!pkceCode && !hasAccessToken) {
  console.error('❌ No PKCE code or tokens received')
  console.error('📍 Current URL:', window.location.href)
  console.error('🔍 This usually means redirect URL is not whitelisted in Supabase')
  
  // Show specific error with instructions
  setError('Configuration error: Redirect URL not whitelisted. Please check Supabase Dashboard.')
  return
}
```

---

## 🧪 Testing Protocol

### Test 1: Check Current Configuration

**Run this in browser console on https://www.oplayr.com:**

```javascript
console.log('Current origin:', window.location.origin)
console.log('Expected emailRedirectTo:', `${window.location.origin}/auth/callback`)
// Should output: https://www.oplayr.com/auth/callback
```

**Then check Supabase Dashboard:**
1. Is this EXACT URL in Redirect URLs list?
2. Is Site URL set to https://www.oplayr.com?

---

### Test 2: Inspect Email Link

1. **Delete old test account:**
   ```sql
   DELETE FROM auth.users WHERE email = 'tian@kykuyo.com';
   ```

2. **Sign up with same email (fresh)**

3. **Check verification email**

4. **Before clicking link, right-click → "Copy link address"**

5. **Paste in text editor and inspect:**
   ```
   https://[project-id].supabase.co/auth/v1/verify?
     token=ABC123...
     &type=signup
     &redirect_to=https%3A%2F%2Fwww.oplayr.com%2Fauth%2Fcallback
   ```

6. **Decode the redirect_to parameter:**
   - Should decode to: `https://www.oplayr.com/auth/callback`
   - Must match Supabase Dashboard exactly (including www)

---

### Test 3: Follow Redirect with DevTools

1. **Open Incognito window**
2. **Open DevTools → Network panel**
3. **Enable "Preserve log"**
4. **Click verification link in email**
5. **Watch the redirect chain**

**Look for:**
```
Name                          Status  Type
verify?token=...             302     document
auth/callback?code=...       200     document  ← Should have ?code=
```

**If you see:**
```
Name                          Status  Type
verify?token=...             302     document
auth/callback                200     document  ← Missing ?code= ❌
```

Then redirect URL is NOT whitelisted.

---

### Test 4: Manual URL Test

**Try accessing callback with fake code:**

```
https://www.oplayr.com/auth/callback?code=test123
```

**Expected:**
- Page loads
- Console shows: "🔑 PKCE code present: true"
- After 5s: Error about invalid code (this is OK - proves code detection works)

**If you get 404 or page doesn't load:**
- Check Vercel routing (`vercel.json`)
- Check SPA rewrite rules

---

## 📋 Action Items for You

### Immediate Actions:

1. **Check Supabase Dashboard RIGHT NOW:**
   - [ ] Go to Authentication → URL Configuration
   - [ ] Verify Site URL is: `https://www.oplayr.com`
   - [ ] Check Redirect URLs list
   - [ ] Add if missing:
     - `https://www.oplayr.com/auth/callback`
     - `https://www.oplayr.com/*`
     - `https://oplayr.com/auth/callback` (without www)
     - `https://oplayr.com/*`

2. **Test with Fresh Email:**
   - [ ] Delete test account in Supabase SQL Editor
   - [ ] Sign up with NEW email (or same email after deletion)
   - [ ] Copy email verification link BEFORE clicking
   - [ ] Inspect `redirect_to` parameter - does it match Dashboard?

3. **Trace Redirect:**
   - [ ] Open DevTools Network panel
   - [ ] Click verification link
   - [ ] Check if `?code=` appears in final URL

4. **Report Back:**
   - What is your Site URL in Supabase Dashboard?
   - What are your Redirect URLs in Supabase Dashboard?
   - What does the `redirect_to` parameter decode to in the email link?
   - Does the final callback URL have `?code=` or not?

---

## 🎯 Expected Outcome

**After fixing redirect URLs:**

1. User clicks verification link
2. Supabase validates domain: `www.oplayr.com` ✅ MATCH
3. Supabase redirects with code: `https://www.oplayr.com/auth/callback?code=ABC123`
4. SDK detects code and exchanges it
5. User redirected to `/complete-profile`
6. **NO MORE** `expired` or `no_tokens` errors

---

## 🚨 If Still Not Working

### Possible causes:

1. **DNS/CDN caching:**
   - Vercel/Cloudflare might cache redirects
   - Try: Different browser, different device, mobile data

2. **Old email links:**
   - Email links generated BEFORE config change won't work
   - Must sign up again to get NEW link with correct redirect

3. **Supabase project issue:**
   - Settings not saving properly
   - Try: Logging out and back into Supabase Dashboard

4. **Email provider rewriting links:**
   - Some email providers (especially corporate) rewrite links for security
   - Try: Gmail, Outlook.com (consumer versions)

---

## 📞 Debug Information Needed

**If still failing, please provide:**

1. **Screenshot of Supabase Dashboard:**
   - Authentication → URL Configuration page
   - (Hide project ID for security)

2. **Raw email link:**
   - Copy verification link from email
   - Paste here (or just the `redirect_to` parameter after decoding)

3. **Browser console logs:**
   - Full console output from clicking link through timeout

4. **Network trace:**
   - Screenshot of DevTools Network panel showing redirect chain

---

**Last Updated:** October 30, 2025  
**Status:** ⏳ Awaiting Supabase Dashboard Verification  
**Next Step:** Check and fix redirect URL configuration in Supabase
