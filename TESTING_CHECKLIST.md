# ✅ Testing Checklist - Onboarding Visibility Fix

## Pre-Testing Setup

### 1. Run Database Migration
- [ ] Open Supabase Dashboard
- [ ] Navigate to SQL Editor
- [ ] Copy content from `supabase/migrations/20251103120000_add_onboarding_completed.sql`
- [ ] Paste and run the SQL
- [ ] Verify success message (no errors)

### 2. Verify Database Changes
- [ ] Go to Supabase → Table Editor → profiles
- [ ] Confirm new column `onboarding_completed` exists
- [ ] Check existing complete profiles have `onboarding_completed = true`
- [ ] Check any test incomplete profiles have `onboarding_completed = false`

### 3. Start Dev Server
```bash
cd client
npm run dev
```
- [ ] Server starts without errors
- [ ] No TypeScript compilation errors
- [ ] Navigate to http://localhost:5173

---

## Test Scenarios

### 🧪 Test 1: New User Signup with Avatar
**Goal**: Verify complete onboarding flow works and user appears in Community

#### Steps:
1. - [ ] Navigate to Sign Up page
2. - [ ] Create new account with fresh email (use +tags if Gmail)
3. - [ ] Select role (Player/Coach/Club)
4. - [ ] Check email and click verification link
5. - [ ] You should land on CompleteProfile page

#### On CompleteProfile Page:
6. - [ ] Verify "Profile Photo (Optional)" section appears at top
7. - [ ] Click on the circular camera icon or "Upload Photo" button
8. - [ ] Select a test image (JPG/PNG)
9. - [ ] Verify image preview appears in the circle
10. - [ ] Verify button changes to "Change Photo"
11. - [ ] Fill in all required fields:
    - Full name
    - Base location
    - Nationality
    - Position (players) / Gender (coaches/players)
12. - [ ] Click "Complete Profile" button
13. - [ ] Verify redirect to dashboard

#### Verify in Community:
14. - [ ] Navigate to Community page from header
15. - [ ] Scroll through "New Members"
16. - [ ] ✅ Verify your new profile card appears
17. - [ ] ✅ Verify avatar shows (if uploaded)
18. - [ ] ✅ Verify all fields display correctly (name, location, etc.)
19. - [ ] ✅ No "?" or missing data

---

### 🧪 Test 2: Incomplete Profile (Should Be Hidden)
**Goal**: Verify incomplete profiles don't appear in Community

#### Steps:
1. - [ ] Create another new account with different email
2. - [ ] Verify email
3. - [ ] **STOP** - Do NOT complete the profile form
4. - [ ] Navigate directly to Community page (type URL or use header)

#### Verify Hidden:
5. - [ ] ✅ Your incomplete profile does NOT appear in New Members
6. - [ ] ✅ No broken "?" cards
7. - [ ] ✅ No cards with missing name/location

#### Complete the Profile:
8. - [ ] Go back and complete the profile (with or without avatar)
9. - [ ] Submit the form
10. - [ ] Go to Community page again
11. - [ ] ✅ NOW your profile should appear

---

### 🧪 Test 3: Existing Complete Profiles (Backfilled)
**Goal**: Verify existing users still appear after migration

#### Steps:
1. - [ ] Go to Community page
2. - [ ] ✅ Verify you see multiple profiles (existing users)
3. - [ ] ✅ Verify profiles look complete (name, location, role badge, etc.)
4. - [ ] ✅ No broken cards or "?" avatars
5. - [ ] ✅ Filtering by role (Players/Coaches/Clubs) works
6. - [ ] ✅ Search functionality still works

---

### 🧪 Test 4: Avatar Upload Edge Cases
**Goal**: Test avatar upload error handling and edge cases

#### Test 4A: Large File
1. - [ ] Start new signup flow
2. - [ ] Try to upload image > 5MB
3. - [ ] ✅ Verify error message appears
4. - [ ] ✅ Form remains functional

#### Test 4B: Invalid Format
1. - [ ] Try to upload non-image file (PDF, etc.)
2. - [ ] ✅ Verify error message or file picker rejects it

#### Test 4C: Skip Avatar
1. - [ ] Start new signup
2. - [ ] **Don't** upload avatar
3. - [ ] Complete form with required fields only
4. - [ ] ✅ Submit works without avatar
5. - [ ] ✅ Profile appears in Community with initials avatar

#### Test 4D: Change Avatar Before Submit
1. - [ ] Upload an avatar
2. - [ ] Click "Change Photo"
3. - [ ] Upload different image
4. - [ ] ✅ Preview updates
5. - [ ] Submit form
6. - [ ] ✅ Latest avatar is saved

---

### 🧪 Test 5: Database Verification
**Goal**: Verify data is correctly stored

#### Steps:
1. - [ ] Go to Supabase Dashboard → Table Editor → profiles
2. - [ ] Find your test profiles
3. - [ ] ✅ Verify `onboarding_completed = true` for completed profiles
4. - [ ] ✅ Verify `onboarding_completed = false` for incomplete ones
5. - [ ] ✅ Verify `avatar_url` is populated if avatar was uploaded
6. - [ ] ✅ Verify all required fields are filled

---

### 🧪 Test 6: Performance Check
**Goal**: Ensure queries are fast

#### Steps:
1. - [ ] Open browser DevTools (F12)
2. - [ ] Go to Network tab
3. - [ ] Navigate to Community page
4. - [ ] Find the Supabase API request
5. - [ ] ✅ Request completes quickly (< 1 second)
6. - [ ] Check Console tab
7. - [ ] ✅ No errors or warnings
8. - [ ] Try searching and filtering
9. - [ ] ✅ All interactions feel snappy

---

### 🧪 Test 7: Different Roles
**Goal**: Test all three user roles

#### Player Profile:
1. - [ ] Create player account
2. - [ ] Upload avatar (optional)
3. - [ ] Fill: name, location, nationality, position, gender
4. - [ ] ✅ Submit successful
5. - [ ] ✅ Appears in Community
6. - [ ] ✅ Blue "Player" badge shows

#### Coach Profile:
1. - [ ] Create coach account
2. - [ ] Upload avatar (optional)
3. - [ ] Fill: name, location, nationality, gender
4. - [ ] ✅ Submit successful
5. - [ ] ✅ Appears in Community
6. - [ ] ✅ Purple "Coach" badge shows

#### Club Profile:
1. - [ ] Create club account
2. - [ ] Upload avatar (optional)
3. - [ ] Fill: club name, location, nationality
4. - [ ] ✅ Submit successful
5. - [ ] ✅ Appears in Community
6. - [ ] ✅ Orange "Club" badge shows

---

### 🧪 Test 8: Mobile Responsiveness
**Goal**: Verify mobile experience

#### Steps:
1. - [ ] Open DevTools (F12)
2. - [ ] Toggle device toolbar (mobile view)
3. - [ ] Test iPhone/Android viewport
4. - [ ] Navigate to Community page
5. - [ ] ✅ Layout looks good (1 column grid)
6. - [ ] ✅ Profile cards are readable
7. - [ ] ✅ Images load properly
8. - [ ] Go through signup flow
9. - [ ] ✅ Avatar upload button is tappable
10. - [ ] ✅ Form fields are usable

---

## Post-Testing Verification

### Check for Errors
- [ ] Browser console - no JavaScript errors
- [ ] Network tab - all requests succeed
- [ ] Supabase logs - no database errors

### Check Data Quality
- [ ] All community profiles show complete data
- [ ] No "?" or broken avatars (unless user didn't upload)
- [ ] All cards have names, locations, roles
- [ ] Filtering and search work correctly

### Performance
- [ ] Community page loads quickly
- [ ] No lag when scrolling
- [ ] Avatar upload feels responsive
- [ ] Form submission is smooth

---

## Issues to Watch For

### ⚠️ Common Issues

#### Issue: "Column onboarding_completed does not exist"
**Solution**: Migration not run. Go to Supabase and run the SQL migration.

#### Issue: No profiles show in Community
**Solution**: 
1. Check if migration backfill ran successfully
2. Manually update test profiles: 
   ```sql
   UPDATE profiles SET onboarding_completed = true WHERE id = 'user-id';
   ```

#### Issue: Avatar upload fails
**Solution**: 
1. Verify `avatars` storage bucket exists
2. Check bucket has correct RLS policies (see AVATAR_UPLOAD_COMPLETE_FIX.md)

#### Issue: TypeScript errors
**Solution**:
1. The `onboarding_completed` field might need to be added to type definitions
2. Restart TypeScript server in VS Code

---

## Success Criteria

### ✅ Test Passed If:
- [ ] New users can complete onboarding with/without avatar
- [ ] Incomplete profiles are hidden from Community
- [ ] Complete profiles appear in Community immediately
- [ ] Existing users (backfilled) still appear
- [ ] Avatar upload works smoothly
- [ ] All three roles work correctly
- [ ] Mobile experience is good
- [ ] No console errors
- [ ] Performance is good (fast queries)

### ❌ Test Failed If:
- [ ] Incomplete profiles appear in Community (shows "?" cards)
- [ ] Complete profiles don't appear
- [ ] Avatar upload fails/errors
- [ ] Database errors in console
- [ ] Migration didn't backfill existing users
- [ ] Filtering/search broken
- [ ] TypeScript compilation errors

---

## Ready to Deploy?

Once all tests pass:

1. - [ ] Review all changes one more time
2. - [ ] Ensure no console errors
3. - [ ] Verify Community looks clean
4. - [ ] Check ONBOARDING_VISIBILITY_FIX.md documentation
5. - [ ] Ready to push to GitHub? ✅

---

**Testing Time Estimate**: 30-45 minutes for thorough testing  
**Quick Test**: 10 minutes (Tests 1, 2, 3 only)

Good luck! 🚀
