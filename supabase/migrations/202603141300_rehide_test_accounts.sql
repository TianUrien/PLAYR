-- Revert 202603141200: re-mark test accounts as test accounts.
-- The prior migration assumed these emails only existed on staging,
-- but they also exist on production, causing test data to leak into
-- the live product.  The frontend now uses environment-aware filtering
-- so staging can still display them when needed.

UPDATE profiles
SET is_test_account = true
WHERE email IN (
  'playrplayer93@gmail.com',
  'clubplayr8@gmail.com',
  'coachplayr@gmail.com',
  'brandplayr@gmail.com'
);
