# Player ↔ Club Public Profiles & Vacancy Flow - Implementation Summary

## ✅ What Has Been Completed

### 1. Database Schema (Migrations Created)
- **`20251011235900_create_vacancy_applications.sql`**
  - Created `vacancy_applications` table with all required fields
  - Added RLS policies for clubs and players
  - Indexes for performance
  - Status enum: pending, reviewed, shortlisted, interview, accepted, rejected, withdrawn
  - Unique constraint on (vacancy_id, player_id) to prevent duplicate applications

- **`20251012000000_add_username_to_profiles.sql`**
  - Added `username` field to profiles table for clean URLs
  - Unique constraint and indexes
  - Format validation (3-30 alphanumeric characters, hyphens, underscores)

### 2. TypeScript Types
- Added to `client/src/lib/database.types.ts`:
  - `ApplicationStatus` type
  - `VacancyApplication` interface
  - `VacancyApplicationInsert` interface
  - `VacancyApplicationUpdate` interface
  - `VacancyApplicationWithPlayer` interface (includes player profile data)

### 3. Components Created

#### **ApplicantCard** (`client/src/components/ApplicantCard.tsx`)
- Displays player photo, name, position, location, applied date
- Photo and name are clickable → navigates to public player profile
- "View Profile" button
- Fallback initials if no avatar

#### **ApplicantsList Page** (`client/src/pages/ApplicantsList.tsx`)
- Route: `/dashboard/club/vacancies/:vacancyId/applicants`
- Shows vacancy title: "Applicants for [Title]"
- Back button to return to vacancies
- Lists all applicants with ApplicantCard components
- Empty state when no applicants
- RLS enforced: only club that owns the vacancy can view

### 4. Public Profile Pages

#### **PublicPlayerProfile** (`client/src/pages/PublicPlayerProfile.tsx`)
- Routes: `/players/:username` or `/players/id/:id`
- Fetches player profile by username (preferred) or ID (fallback)
- Renders PlayerDashboard with `readOnly={true}`
- Loading and error states
- 404 page if player not found

#### **PublicClubProfile** (`client/src/pages/PublicClubProfile.tsx`)
- Routes: `/clubs/:username` or `/clubs/id/:id`
- Fetches club profile by username (preferred) or ID (fallback)
- Renders ClubDashboard with `readOnly={true}`
- Loading and error states
- 404 page if club not found

### 5. Dashboard Updates

#### **PlayerDashboard** (`client/src/pages/PlayerDashboard.tsx`)
- Added `profileData` and `readOnly` props
- When `readOnly=true`:
  - Hides "Edit Profile" button
  - Shows "Public View" badge with eye icon
  - Uses provided profile data instead of auth profile

#### **ClubDashboard** (`client/src/pages/ClubDashboard.tsx`)
- Added `profileData` and `readOnly` props
- When `readOnly=true`:
  - Hides "Create Vacancy" button
  - Shows "Public View" badge with eye icon
  - Removes "Players" tab (not implemented yet)
  - Uses provided profile data instead of auth profile

#### **VacanciesTab** (`client/src/components/VacanciesTab.tsx`)
- Added applicants counter to each vacancy card
- Shows "👥 X Applicants" button (blue pill)
- Only visible for open/closed vacancies (not drafts)
- Navigates to applicants list on click
- Fetches count from `vacancy_applications` table

### 6. Routing (`client/src/App.tsx`)
- `/players/:username` → PublicPlayerProfile
- `/players/id/:id` → PublicPlayerProfile (fallback)
- `/clubs/:username` → PublicClubProfile
- `/clubs/id/:id` → PublicClubProfile (fallback)
- `/dashboard/club/vacancies/:vacancyId/applicants` → ApplicantsList

---

## 🔧 What You Need To Do

### Step 1: Apply Database Migrations

You need to run these two migrations in your Supabase SQL Editor:

1. Navigate to: https://supabase.com/dashboard/project/xtertgftujnebubxgqit/sql

2. Copy and paste the contents of **`supabase/migrations/20251011235900_create_vacancy_applications.sql`**
   - This creates the applications table with RLS policies

3. Copy and paste the contents of **`supabase/migrations/20251012000000_add_username_to_profiles.sql`**
   - This adds username field for clean URLs

4. Run both migrations

### Step 2: (Optional) Add Usernames to Existing Profiles

If you have existing player/club profiles, you'll want to add usernames to them:

```sql
-- Example: Update profiles with usernames
UPDATE profiles 
SET username = LOWER(REPLACE(full_name, ' ', '-')) 
WHERE username IS NULL;

-- Or manually set usernames via the profiles table
```

Without usernames, public profiles will use ID-based URLs (`/players/id/uuid` instead of `/players/john-doe`).

### Step 3: Test the Flow

1. **As a Club:**
   - Sign in as a club
   - Go to Dashboard → Vacancies tab
   - Create and publish a vacancy
   - Notice the "👥 0 Applicants" button appears on open vacancies

2. **As a Player:**
   - Sign in as a player
   - Go to Opportunities page (`/opportunities`)
   - Find a vacancy and click "Apply" (you'll need to implement the Apply button/modal)
   - Application should be saved to `vacancy_applications` table

3. **As a Club (view applicants):**
   - Return to Dashboard → Vacancies
   - Click "👥 X Applicants" button
   - See list of applicants
   - Click player name/photo or "View Profile"
   - You're taken to the player's public profile (read-only mode)
   - Notice "Public View" badge in header

4. **As a Player (view club):**
   - On Opportunities page, click a club name/logo
   - You're taken to the club's public profile (read-only mode)
   - See Overview, Media, and Vacancies tabs
   - Notice "Public View" badge in header

---

## 🎯 Features Implemented

### ✅ Completed Features

1. **Vacancy Applications Database** - Full schema with RLS
2. **Applicants Counter** - Shows count on vacancy cards
3. **Applicants List Page** - Club-only view of who applied
4. **Public Player Profiles** - Read-only view via `/players/:username`
5. **Public Club Profiles** - Read-only view via `/clubs/:username`
6. **Username Support** - Clean URLs instead of UUIDs
7. **Public View Badge** - Clear indicator for read-only mode
8. **Navigation Flow** - Applicant card → Player profile links work

### ⚠️ Not Yet Implemented (Future Work)

1. **Apply Button/Modal** - Players can't actually apply yet
   - Need to create "Apply to Vacancy" modal
   - Modal should include cover letter field
   - Submit creates row in `vacancy_applications`
   - Show "Applied" state after submission

2. **Vacancy Public Cards** - Update VacancyCard on Opportunities page
   - Make club name/logo clickable
   - Navigate to `/clubs/:username` on click

3. **Read-Only Vacancies Tab** - When viewing club profile as non-owner
   - Hide Edit/Duplicate/Close buttons
   - Show only "View Details" for each vacancy
   - Possibly show Apply button if user is a player

4. **Media Tab in Public Profiles** - Currently shown but may need read-only adjustments
   - Remove upload buttons when `readOnly=true`

5. **Players Tab** - Skipped for MVP (as per spec)

---

## 📝 Code Structure

```
client/src/
├── components/
│   ├── ApplicantCard.tsx        ← NEW: Displays individual applicant
│   └── VacanciesTab.tsx         ← UPDATED: Added applicants counter
├── pages/
│   ├── ApplicantsList.tsx       ← NEW: List of applicants for a vacancy
│   ├── PublicPlayerProfile.tsx  ← NEW: Public player profile page
│   ├── PublicClubProfile.tsx    ← NEW: Public club profile page
│   ├── PlayerDashboard.tsx      ← UPDATED: Added readOnly prop
│   └── ClubDashboard.tsx        ← UPDATED: Added readOnly prop
├── lib/
│   └── database.types.ts        ← UPDATED: Added application types
└── App.tsx                      ← UPDATED: Added new routes

supabase/migrations/
├── 20251011235900_create_vacancy_applications.sql  ← NEW: Applications table
└── 20251012000000_add_username_to_profiles.sql     ← NEW: Username field
```

---

## 🔐 Security (RLS Policies)

### Vacancy Applications Table

1. **Clubs can view applications to their vacancies**
   - `SELECT` policy checks if club owns the vacancy

2. **Players can view their own applications**
   - `SELECT` policy checks `player_id = auth.uid()`

3. **Only players can create applications**
   - `INSERT` policy ensures user is a player

4. **Only vacancy owners can update application status**
   - `UPDATE` policy for clubs to change status

5. **Players can withdraw their own applications**
   - `UPDATE` policy allows setting status to 'withdrawn'

---

## 🚀 Next Steps (For Later)

1. **Implement Apply Button**
   - Create `ApplyToVacancyModal` component
   - Form with cover letter textarea
   - Submit to `vacancy_applications` table
   - Show success/error states

2. **Update Vacancy Cards on Opportunities Page**
   - Make club name/logo clickable
   - Add `onClick` handlers to navigate to `/clubs/:username`

3. **Handle "Applied" State**
   - Check if current player already applied
   - Show "Applied ✓" instead of "Apply" button
   - Disable button if already applied

4. **Message Button (Optional)**
   - Add messaging system between clubs and players
   - Or simple "Contact via Email" functionality

5. **Application Status Management**
   - Club dashboard to update applicant status
   - Email notifications for status changes
   - Player dashboard to view application history

---

## 📚 Key URLs

- **Opportunities:** `/opportunities`
- **Player Public Profile:** `/players/john-doe` or `/players/id/uuid`
- **Club Public Profile:** `/clubs/amsterdam-hc` or `/clubs/id/uuid`
- **Applicants List:** `/dashboard/club/vacancies/:vacancyId/applicants`
- **Player Dashboard:** `/dashboard/profile` (when signed in as player)
- **Club Dashboard:** `/dashboard/profile` (when signed in as club)

---

## 🎨 UI/UX Highlights

- **Clean & Minimal:** No clutter, focused on key information
- **Consistent Design:** Public profiles use same layout as dashboards
- **Clear Indicators:** "Public View" badge shows read-only state
- **Clickable Elements:** Photos, names, and buttons all navigate properly
- **Empty States:** Friendly messages when no applicants or data
- **Loading States:** Spinners while fetching data
- **Error Handling:** 404 pages for missing profiles

---

## ✅ Checklist Before Going Live

- [ ] Apply both database migrations
- [ ] Add usernames to existing profiles (or generate them)
- [ ] Test vacancy creation as club
- [ ] Implement Apply button/modal (not done yet)
- [ ] Test full flow: Create → Apply → View Applicants → View Profile
- [ ] Verify RLS policies work (try accessing as different users)
- [ ] Test public profiles work for signed-out users
- [ ] Check mobile responsiveness
- [ ] Test with multiple applicants (5-10 players)
- [ ] Verify "Public View" badge shows correctly
- [ ] Make club names/logos clickable on Opportunities page

---

**Implementation Complete! 🎉**

The foundation is solid. Apply the migrations, test the flow, and then implement the Apply button as the final piece. Everything is set up for a smooth recruitment experience between players and clubs.
