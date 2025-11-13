# Coach Opportunity Conditional Fields Implementation

## Overview
Successfully implemented conditional logic to hide Position and Gender fields when creating/editing Coach opportunities. These fields are now only required and visible for Player opportunities.

## Changes Implemented

### 1. CreateVacancyModal.tsx
**Validation Logic:**
- Modified `validate()` function to only require `position` and `gender` when `opportunity_type === 'player'`
- Coach opportunities can be saved without these fields

**Form Submission:**
- Updated `handleSave()` to use `Partial<VacancyInsert>` type
- Sets `position` and `gender` to `undefined` for coach opportunities
- Only includes these fields for player opportunities

**UI Changes:**
- Wrapped Position and Gender form fields in conditional rendering:
  ```tsx
  {formData.opportunity_type === 'player' && (
    <div>
      {/* Position and Gender fields */}
    </div>
  )}
  ```

### 2. VacancyDetailView.tsx
**Badge Display:**
- Gender badge only renders when `opportunity_type === 'player'` and gender is present
- Position badge only renders when `opportunity_type === 'player'` and position is present
- Coach opportunities show clean detail view without these badges

### 3. VacancyCard.tsx
**Card Display:**
- Gender badge hidden for coach opportunities
- Position section (with icon and text) hidden for coach opportunities
- Maintains clean card layout for both opportunity types

### 4. VacanciesTab.tsx
**List View:**
- Conditional metadata display based on opportunity type
- Player opportunities: Shows position and gender badges
- Coach opportunities: Shows "Coach Position" badge instead
- Maintains consistent visual hierarchy

### 5. Database Migration
**File:** `supabase/migrations/20251107000000_make_position_gender_nullable_for_coaches.sql`

**Changes:**
```sql
-- Make position and gender nullable to support coach opportunities
ALTER TABLE vacancies 
  ALTER COLUMN position DROP NOT NULL,
  ALTER COLUMN gender DROP NOT NULL;

-- Add check constraint to ensure player opportunities still require these fields
ALTER TABLE vacancies 
  ADD CONSTRAINT check_player_fields 
  CHECK (
    opportunity_type != 'player' OR (position IS NOT NULL AND gender IS NOT NULL)
  );
```

**Migration Status:** ⏳ File created, needs to be applied

## Testing Checklist

### Before Migration
- [x] Build succeeds with updated component logic
- [x] No TypeScript compilation errors (using Partial type)
- [x] All imports corrected to use '../lib/supabase'

### After Migration (To Be Completed)
- [ ] Run migration: `supabase migration up`
- [ ] Regenerate types: `supabase gen types typescript`
- [ ] Rebuild application
- [ ] Test creating new Coach opportunity
  - [ ] Position field hidden
  - [ ] Gender field hidden
  - [ ] Form saves successfully
  - [ ] No validation errors
- [ ] Test creating new Player opportunity
  - [ ] Position field visible and required
  - [ ] Gender field visible and required
  - [ ] Validation enforces required fields
- [ ] Test viewing Coach opportunity
  - [ ] No Position badge in detail view
  - [ ] No Gender badge in detail view
  - [ ] Clean card display in lists
- [ ] Test viewing Player opportunity
  - [ ] Position badge displays correctly
  - [ ] Gender badge displays correctly
  - [ ] All metadata visible
- [ ] Test editing existing opportunities
  - [ ] Coach opportunities load without errors
  - [ ] Player opportunities maintain required fields

## Deployment Steps

1. **Apply Database Migration:**
   ```bash
   cd supabase
   supabase migration up
   ```

2. **Regenerate TypeScript Types:**
   ```bash
   supabase gen types typescript --local > ../client/src/lib/database.types.ts
   ```

3. **Rebuild Application:**
   ```bash
   cd ../client
   npm run build
   ```

4. **Test Locally:**
   ```bash
   npm run dev
   ```
   - Create coach opportunity
   - Create player opportunity
   - Verify conditional logic works

5. **Deploy to Production:**
   ```bash
   git add .
   git commit -m "feat: conditional position/gender fields for coach opportunities"
   git push origin main
   ```

6. **Apply Migration to Production:**
   - Run migration in Supabase dashboard
   - Or use Supabase CLI: `supabase db push`

## Benefits

✅ **Improved UX:** Coach opportunities no longer show irrelevant player-specific fields
✅ **Data Integrity:** Check constraint ensures player opportunities still require these fields
✅ **Consistent UI:** All views (create, detail, card, list) handle both types correctly
✅ **Type Safety:** TypeScript types will align with database schema after migration
✅ **Backwards Compatible:** Existing player opportunities continue to work as expected

## Technical Notes

- Used `Partial<VacancyInsert>` to allow conditional field inclusion
- Database constraint enforces data integrity at schema level
- UI components consistently check `opportunity_type` before rendering fields
- Migration is reversible if needed (can add NOT NULL back and remove constraint)

## Status: ✅ Implementation Complete, ⏳ Migration Pending

All code changes are complete and building successfully. The database migration needs to be applied to production database to fully enable this functionality.
