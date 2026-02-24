-- Pre-normalization: fix non-standard gender values before CHECK constraint
-- Production audit (2026-02-24): Men=48, Women=47, NULL=34, male=2, female=2
-- This must run before 202602240100 which adds the CHECK constraint.
UPDATE profiles SET gender = 'Men' WHERE LOWER(gender) = 'male';
UPDATE profiles SET gender = 'Women' WHERE LOWER(gender) = 'female';
