-- Remove MVP placeholder leagues and empty provinces for Argentina
-- These were seeded in the initial world directory migration (202601151000)
-- as temporary placeholders and were never populated with clubs.
--
-- Before: Argentina shows 5 leagues (3 Buenos Aires + Córdoba MVP + Mendoza MVP)
-- After:  Argentina shows 3 leagues (Buenos Aires only)

BEGIN;

-- Delete the MVP placeholder leagues (no clubs reference these)
DELETE FROM world_leagues
WHERE name IN ('Torneo Oficial Córdoba (MVP)', 'Torneo Oficial Mendoza (MVP)');

-- Delete the now-empty Córdoba and Mendoza provinces
-- (no clubs or leagues reference them after the above delete)
DELETE FROM world_provinces
WHERE slug IN ('cordoba', 'mendoza')
  AND country_id = (SELECT id FROM countries WHERE code = 'AR');

COMMIT;
