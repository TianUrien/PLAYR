# LOCAL TESTING GUIDE - Zombie Account Fix
## November 3, 2025

---

## ✅ WHAT'S BEEN UPDATED

**File Modified**: `client/src/pages/CompleteProfile.tsx`

**Changes Made**:
1. Added **retry logic** with exponential backoff (3 attempts)
2. Handles **conflict errors** (23505) - if profile already exists, fetches it instead of failing
3. Better **error messages** with clear user guidance
4. Waits 1s, 2s, 4s between retries (exponential backoff)

**Why This Helps**:
- ✅ Network timeouts no longer cause permanent failures
- ✅ Handles race conditions (if profile gets created by another tab/process)
- ✅ Retries automatically without user intervention
- ✅ Clear error message if all retries fail

---

## 🧪 LOCAL TEST SCENARIOS

### ✅ Dev Server Status
```
Server: ✅ RUNNING
URL: http://localhost:5173/
Status: Ready for testing
```

---

### 🎯 TEST #1: New User Sign-Up (Happy Path)

**Purpose**: Verify normal flow works

**Steps**:
1. Open http://localhost:5173/
2. Click "Join Now" → Sign Up
3. Select role (Player/Coach/Club)
4. Enter email + password
5. Check email inbox (use temp email service if needed: temp-mail.org)
6. Click verification link
7. Should redirect to /complete-profile
8. Fill out form completely
9. Click "Complete Profile"
10. Should redirect to dashboard

**Expected Result**: 
✅ Smooth flow from sign-up → verification → profile completion → dashboard

**Console Messages to Watch**:
```
[SIGN IN] Sign in successful, checking profile...
[SIGN IN] Profile incomplete, redirecting to complete profile
[DEBUG] Profile not found, creating basic profile with retry
[DEBUG] Profile creation attempt 1/3
[DEBUG] Basic profile created successfully on attempt 1
```

---

### 🎯 TEST #2: Zombie Account Recovery

**Purpose**: Verify existing incomplete profiles can be completed

**Steps**:
1. Sign in with an account that has:
   - ✅ Verified email
   - ❌ No profile OR incomplete profile (null full_name)
2. Should auto-redirect to /complete-profile
3. Fill out form
4. Submit
5. Should redirect to dashboard

**Expected Result**:
✅ Zombie account recovers automatically

**Console Messages to Watch**:
```
[SIGN IN] Profile incomplete (no full_name), redirecting to complete profile
[DEBUG] Profile not found, creating basic profile with retry
[DEBUG] Profile creation attempt 1/3
[DEBUG] Profile already exists (conflict), fetching it
```

---

### 🎯 TEST #3: Network Retry (Simulated Slow Network)

**Purpose**: Verify retry logic works

**Steps**:
1. Open Chrome DevTools (F12)
2. Go to Network tab
3. Change throttling to "Slow 3G"
4. Sign up new account
5. Verify email
6. Complete profile form
7. Submit

**Expected Result**:
✅ May take longer but should succeed on retry

**Console Messages to Watch**:
```
[DEBUG] Profile creation attempt 1/3
[DEBUG] Waiting 1000ms before retry...
[DEBUG] Profile creation attempt 2/3
[DEBUG] Basic profile created successfully on attempt 2
```

---

### 🎯 TEST #4: Conflict Resolution (Multiple Tabs)

**Purpose**: Verify handles race conditions

**Steps**:
1. Sign up new account
2. Verify email
3. Verification link opens /complete-profile
4. Open SECOND tab with same URL
5. Fill form in FIRST tab, submit
6. Go to SECOND tab, refresh page
7. Should load form with profile data

**Expected Result**:
✅ Both tabs handle the profile correctly, no crashes

**Console Messages to Watch**:
```
[DEBUG] Profile already exists (conflict), fetching it
```

---

## 🔍 WHAT TO CHECK

### ✅ Success Indicators:
- [ ] No infinite redirect loops
- [ ] Profile gets created after verification
- [ ] Form can be submitted successfully
- [ ] Dashboard loads after profile completion
- [ ] No "Could not create your profile" errors (unless all retries fail)
- [ ] Zombie accounts can sign in and complete profile

### ❌ Failure Indicators:
- [ ] Stuck on "Loading your profile..." forever
- [ ] Error: "Could not create your profile" after 3 retries
- [ ] Infinite loop between /complete-profile and /dashboard
- [ ] Dashboard crashes with null reference errors
- [ ] Can't sign in after verification

---

## 📊 MONITORING CONSOLE LOGS

Open browser console (F12) and watch for these messages:

**Good Signs** ✅:
```
[DEBUG] Profile creation attempt 1/3
[DEBUG] Basic profile created successfully on attempt 1
[DEBUG] Profile updated successfully
[DEBUG] Auth store refreshed - profile now complete
[DEBUG] Navigating to dashboard
```

**Warning Signs** ⚠️:
```
[DEBUG] Waiting 1000ms before retry...
[DEBUG] Profile creation attempt 2/3
```
(Retry is happening - acceptable, should still succeed)

**Bad Signs** ❌:
```
[ERROR] Error creating profile after 3 attempts
[ROUTER] Profile incomplete (no full_name), redirecting  (repeated)
```
(All retries failed - notify me)

---

## 🐛 IF SOMETHING FAILS

### Scenario A: Profile Creation Fails After 3 Retries

**Error**: "Could not create your profile. Please refresh the page..."

**What to do**:
1. Check browser console for actual error
2. Copy the error message
3. Check Supabase logs at: https://supabase.com/dashboard/project/YOUR_PROJECT/logs
4. Notify me with:
   - Error message from console
   - Error from Supabase logs
   - Which test scenario failed

### Scenario B: Infinite Redirect Loop

**Symptoms**: Stuck between /complete-profile and /dashboard

**What to do**:
1. Check console for repeating messages
2. Open DevTools → Application → Local Storage
3. Check what's stored in localStorage
4. Notify me with:
   - Console log screenshot
   - localStorage contents
   - User account details (email/role)

### Scenario C: Dashboard Crashes

**Error**: Blank screen or "Something went wrong"

**What to do**:
1. Check console for error stack trace
2. Note which dashboard (Player/Coach/Club)
3. Notify me with:
   - Error message
   - User role
   - Whether profile has full_name populated

---

## 📝 TEST RESULTS TEMPLATE

After testing, please report using this format:

```
TEST RESULTS:

✅ Test #1 (New User): PASSED / FAILED
   Notes: 

✅ Test #2 (Zombie Recovery): PASSED / FAILED
   Notes:

✅ Test #3 (Network Retry): PASSED / FAILED
   Notes:

✅ Test #4 (Conflict Resolution): PASSED / FAILED
   Notes:

OVERALL: READY TO DEPLOY / NEEDS FIXES

Issues Found:
1. 
2. 

Console Errors (if any):
```

---

## 🎯 NEXT STEPS

### If Tests Pass ✅:
1. **You notify me**: "Tests passed, ready to deploy"
2. **I will prepare**: Production deployment checklist
3. **We deploy**: Database migration + code to production
4. **We monitor**: 24 hours of metrics

### If Tests Fail ❌:
1. **You notify me**: Test results with errors
2. **I will analyze**: Root cause of failures
3. **I will fix**: Issues identified
4. **We retest**: Until all pass

---

## 🚀 QUICK START

**Right now, to start testing**:

1. Open: http://localhost:5173/
2. Clear browser cache & cookies (important!)
3. Run Test #1 (new user sign-up)
4. Watch console for logs
5. Report results

---

**Status**: 🟢 READY TO TEST
**Server**: ✅ RUNNING (localhost:5173)
**Changes**: ✅ DEPLOYED LOCALLY
**Waiting for**: Your test results

---

**Test Duration**: ~15-30 minutes for all scenarios
**When to Report**: After completing at least Test #1 and Test #2
