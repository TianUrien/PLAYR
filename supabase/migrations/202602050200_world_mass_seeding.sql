-- World Mass Seeding Migration
-- Seeds 130+ clubs across 8 countries from the validated CSV master sheet.
--
-- PHASE 1: Create missing leagues (Spain, Belgium, Uruguay)
-- PHASE 2: Insert all clubs (skips existing via ON CONFLICT)
-- PHASE 3: Mark pre-claimed clubs and sync profiles
--
-- Encoding corrections are applied inline for club names affected by
-- UTF-8 → Latin-1 Mojibake in the CSV export.

BEGIN;

-- ============================================================================
-- PHASE 1: Seed missing leagues for new countries
-- ============================================================================
DO $$
DECLARE
  v_spain_id INT;
  v_belgium_id INT;
  v_uruguay_id INT;
BEGIN
  SELECT id INTO v_spain_id FROM countries WHERE code = 'ES';
  SELECT id INTO v_belgium_id FROM countries WHERE code = 'BE';
  SELECT id INTO v_uruguay_id FROM countries WHERE code = 'UY';

  IF v_spain_id IS NULL THEN RAISE EXCEPTION 'Spain (ES) not found in countries'; END IF;
  IF v_belgium_id IS NULL THEN RAISE EXCEPTION 'Belgium (BE) not found in countries'; END IF;
  IF v_uruguay_id IS NULL THEN RAISE EXCEPTION 'Uruguay (UY) not found in countries'; END IF;

  -- Spain — region-less (province_id = NULL)
  INSERT INTO world_leagues (province_id, country_id, name, slug, tier, logical_id, display_order)
  VALUES
    (NULL, v_spain_id, 'División de Honor',                    'division-de-honor',      1, 'es_m_1', 1),
    (NULL, v_spain_id, 'División de Honor A (Liga Iberdrola)', 'division-honor-a-women', 1, 'es_w_1', 2),
    (NULL, v_spain_id, 'División de Honor B',                  'division-de-honor-b',    2, 'es_2',   3)
  ON CONFLICT (logical_id) DO UPDATE SET name = EXCLUDED.name, tier = EXCLUDED.tier;

  -- Belgium — region-less
  INSERT INTO world_leagues (province_id, country_id, name, slug, tier, logical_id, display_order)
  VALUES
    (NULL, v_belgium_id, 'Men''s Belgian Hockey League',   'mens-belgian-hockey-league',   1, 'be_m_1', 1),
    (NULL, v_belgium_id, 'Women''s Belgian Hockey League', 'womens-belgian-hockey-league', 1, 'be_w_1', 2),
    (NULL, v_belgium_id, 'National 1',                     'national-1',                   2, 'be_2',   3)
  ON CONFLICT (logical_id) DO UPDATE SET name = EXCLUDED.name, tier = EXCLUDED.tier;

  -- Uruguay — region-less
  INSERT INTO world_leagues (province_id, country_id, name, slug, tier, logical_id, display_order)
  VALUES
    (NULL, v_uruguay_id, 'Primera Damas', 'primera-damas', 1, 'uy_w_1', 1)
  ON CONFLICT (logical_id) DO UPDATE SET name = EXCLUDED.name, tier = EXCLUDED.tier;

  RAISE NOTICE 'Phase 1 complete: Spain, Belgium, Uruguay leagues seeded';
END;
$$;

-- ============================================================================
-- PHASE 2: Insert all clubs
-- ============================================================================
-- Uses the unique index on (club_name_normalized, country_id, COALESCE(province_id, 0))
-- to skip clubs that already exist (CASI, San Fernando).
-- Encoding corrections applied inline.
DO $$
DECLARE
  -- Country IDs
  v_ar INT; v_uy INT; v_it INT; v_de INT; v_es INT; v_be INT; v_en INT; v_au INT;
  -- Province IDs (Argentina + Australia)
  v_ar_ba INT;
  v_au_nat INT; v_au_vic INT; v_au_wa INT;
  -- League IDs — Argentina
  v_ar_metro_a INT; v_ar_metro_b INT; v_ar_metro_c INT;
  -- League IDs — Italy
  v_it_elite INT;
  -- League IDs — Germany
  v_de_bl1 INT; v_de_bl2 INT;
  -- League IDs — Spain
  v_es_dh INT; v_es_dha INT; v_es_dhb INT;
  -- League IDs — Belgium
  v_be_m INT; v_be_w INT; v_be_n1 INT;
  -- League IDs — Uruguay
  v_uy_pd INT;
  -- League IDs — England
  v_en_pd INT; v_en_d1s INT;
  -- League IDs — Australia
  v_au_hol INT;
  v_au_wa_pl INT; v_au_vic_pl INT;
  v_au_vic_vl1 INT; v_au_vic_vl2 INT;
  -- Counter
  v_inserted INT := 0;
BEGIN
  -- ---- Resolve country IDs ----
  SELECT id INTO v_ar FROM countries WHERE name = 'Argentina';
  SELECT id INTO v_uy FROM countries WHERE name = 'Uruguay';
  SELECT id INTO v_it FROM countries WHERE name = 'Italy';
  SELECT id INTO v_de FROM countries WHERE name = 'Germany';
  SELECT id INTO v_es FROM countries WHERE name = 'Spain';
  SELECT id INTO v_be FROM countries WHERE name = 'Belgium';
  SELECT id INTO v_en FROM countries WHERE code = 'XE';  -- England (World directory entry)
  SELECT id INTO v_au FROM countries WHERE name = 'Australia';

  -- ---- Resolve province IDs ----
  SELECT id INTO v_ar_ba   FROM world_provinces WHERE slug = 'buenos-aires' AND country_id = v_ar;
  SELECT id INTO v_au_nat  FROM world_provinces WHERE logical_id = 'au_nat';
  SELECT id INTO v_au_vic  FROM world_provinces WHERE logical_id = 'au_vic';
  SELECT id INTO v_au_wa   FROM world_provinces WHERE logical_id = 'au_westa';

  -- ---- Resolve league IDs ----
  -- Argentina (province-scoped)
  SELECT id INTO v_ar_metro_a FROM world_leagues WHERE logical_id = 'ar_ba_1';
  SELECT id INTO v_ar_metro_b FROM world_leagues WHERE logical_id = 'ar_ba_2';
  SELECT id INTO v_ar_metro_c FROM world_leagues WHERE logical_id = 'ar_ba_3';
  -- Italy
  SELECT id INTO v_it_elite FROM world_leagues WHERE logical_id = 'it_w_1';
  -- Germany
  SELECT id INTO v_de_bl1 FROM world_leagues WHERE logical_id = 'ger_1';
  SELECT id INTO v_de_bl2 FROM world_leagues WHERE logical_id = 'ger_2';
  -- Spain
  SELECT id INTO v_es_dh  FROM world_leagues WHERE logical_id = 'es_m_1';
  SELECT id INTO v_es_dha FROM world_leagues WHERE logical_id = 'es_w_1';
  SELECT id INTO v_es_dhb FROM world_leagues WHERE logical_id = 'es_2';
  -- Belgium
  SELECT id INTO v_be_m  FROM world_leagues WHERE logical_id = 'be_m_1';
  SELECT id INTO v_be_w  FROM world_leagues WHERE logical_id = 'be_w_1';
  SELECT id INTO v_be_n1 FROM world_leagues WHERE logical_id = 'be_2';
  -- Uruguay
  SELECT id INTO v_uy_pd FROM world_leagues WHERE logical_id = 'uy_w_1';
  -- England
  SELECT id INTO v_en_pd  FROM world_leagues WHERE logical_id = 'en_1';
  SELECT id INTO v_en_d1s FROM world_leagues WHERE logical_id = 'en_2';
  -- Australia
  SELECT id INTO v_au_hol    FROM world_leagues WHERE logical_id = 'au_nat';
  SELECT id INTO v_au_wa_pl  FROM world_leagues WHERE province_id = v_au_wa  AND name = 'Premier League';
  SELECT id INTO v_au_vic_pl FROM world_leagues WHERE province_id = v_au_vic AND name = 'Premier League';
  SELECT id INTO v_au_vic_vl1 FROM world_leagues WHERE logical_id = 'au_vic_2';
  SELECT id INTO v_au_vic_vl2 FROM world_leagues WHERE logical_id = 'au_vic_3';

  -- Validate critical lookups
  IF v_ar IS NULL THEN RAISE EXCEPTION 'Argentina not found'; END IF;
  IF v_en IS NULL THEN RAISE EXCEPTION 'England (XE) not found'; END IF;
  IF v_au IS NULL THEN RAISE EXCEPTION 'Australia not found'; END IF;
  IF v_ar_ba IS NULL THEN RAISE EXCEPTION 'Buenos Aires province not found'; END IF;
  IF v_ar_metro_a IS NULL THEN RAISE EXCEPTION 'Torneo Metropolitano A league not found'; END IF;

  -- ==================================================================
  -- ARGENTINA — Buenos Aires (22 clubs)
  -- ==================================================================
  INSERT INTO world_clubs (club_id, club_name, club_name_normalized, country_id, province_id, men_league_id, women_league_id, is_claimed, created_from)
  VALUES
    ('casi_ar_ba',          'CASI',                                          'casi',                                          v_ar, v_ar_ba, NULL,          v_ar_metro_c, false, 'seed'),
    ('sanfer_ar_ba',        'San Fernando',                                  'san fernando',                                  v_ar, v_ar_ba, v_ar_metro_a,  v_ar_metro_a, false, 'seed'),
    ('belgrano_ar_ba',      'Belgrano Athletic Club',                        'belgrano athletic club',                        v_ar, v_ar_ba, v_ar_metro_a,  v_ar_metro_a, false, 'seed'),
    ('italiano_ar_ba',      'Club Italiano',                                 'club italiano',                                 v_ar, v_ar_ba, v_ar_metro_a,  v_ar_metro_a, false, 'seed'),
    ('cuba_ar_ba',          'CUBA',                                          'cuba',                                          v_ar, v_ar_ba, v_ar_metro_b,  v_ar_metro_a, false, 'seed'),
    ('sla_ar_ba',           'San Lorenzo de Almagro',                        'san lorenzo de almagro',                        v_ar, v_ar_ba, v_ar_metro_a,  v_ar_metro_a, false, 'seed'),
    ('lomas_ar_ba',         'Lomas',                                         'lomas',                                         v_ar, v_ar_ba, v_ar_metro_a,  v_ar_metro_a, false, 'seed'),
    ('geba_ar_ba',          'GEBA (Gimnasia y Esgrima de Buenos Aires)',      'geba (gimnasia y esgrima de buenos aires)',      v_ar, v_ar_ba, v_ar_metro_a,  v_ar_metro_a, false, 'seed'),
    ('riverplate_ar_ba',    'River Plate',                                   'river plate',                                   v_ar, v_ar_ba, v_ar_metro_a,  v_ar_metro_a, false, 'seed'),
    ('ciudad_ar_ba',        'Ciudad',                                        'ciudad',                                        v_ar, v_ar_ba, v_ar_metro_a,  v_ar_metro_a, false, 'seed'),
    ('santbar_ar_ba',       'Santa Bárbara',                                 'santa bárbara',                                 v_ar, v_ar_ba, v_ar_metro_a,  v_ar_metro_a, false, 'seed'),
    ('stcath_ar_ba',        'St. Catherine''s',                              'st. catherine''s',                              v_ar, v_ar_ba, v_ar_metro_a,  v_ar_metro_a, false, 'seed'),
    ('bancop_ar_ba',        'Banco Provincia',                               'banco provincia',                               v_ar, v_ar_ba, v_ar_metro_a,  v_ar_metro_a, false, 'seed'),
    ('arqui_ar_ba',         'Arquitectura',                                  'arquitectura',                                  v_ar, v_ar_ba, v_ar_metro_a,  v_ar_metro_a, false, 'seed'),
    ('bnacion_ar_ba',       'Banco Nación',                                  'banco nación',                                  v_ar, v_ar_ba, v_ar_metro_a,  v_ar_metro_a, false, 'seed'),
    ('quilmes_ar_ba',       'Quilmes',                                       'quilmes',                                       v_ar, v_ar_ba, v_ar_metro_a,  v_ar_metro_a, false, 'seed'),
    ('ferro_ar_ba',         'Ferro Carril Oeste',                            'ferro carril oeste',                            v_ar, v_ar_ba, v_ar_metro_a,  v_ar_metro_a, false, 'seed'),
    ('olivos_ar_ba',        'Olivos',                                        'olivos',                                        v_ar, v_ar_ba, v_ar_metro_a,  v_ar_metro_a, false, 'seed'),
    ('sic_ar_ba',           'SIC',                                           'sic',                                           v_ar, v_ar_ba, NULL,          v_ar_metro_b, false, 'seed'),
    ('hurling_ar_ba',       'Hurling',                                       'hurling',                                       v_ar, v_ar_ba, v_ar_metro_a,  v_ar_metro_b, false, 'seed'),
    ('banade_ar_ba',        'Banade',                                        'banade',                                        v_ar, v_ar_ba, v_ar_metro_a,  NULL,         false, 'seed'),
    ('lnaval_ar_ba',        'Liceo Naval',                                   'liceo naval',                                   v_ar, v_ar_ba, NULL,          v_ar_metro_c, false, 'seed')
  ON CONFLICT ON CONSTRAINT world_clubs_club_id_key DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RAISE NOTICE 'Argentina: % clubs inserted (existing skipped)', v_inserted;

  -- ==================================================================
  -- URUGUAY (1 club)
  -- ==================================================================
  INSERT INTO world_clubs (club_id, club_name, club_name_normalized, country_id, province_id, men_league_id, women_league_id, is_claimed, created_from)
  VALUES
    ('oldchristians_uy', 'Old Christians Club', 'old christians club', v_uy, NULL, NULL, v_uy_pd, false, 'seed')
  ON CONFLICT ON CONSTRAINT world_clubs_club_id_key DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RAISE NOTICE 'Uruguay: % clubs inserted', v_inserted;

  -- ==================================================================
  -- ITALY (15 clubs)
  -- ==================================================================
  INSERT INTO world_clubs (club_id, club_name, club_name_normalized, country_id, province_id, men_league_id, women_league_id, is_claimed, created_from)
  VALUES
    ('hcu_rassemblement_it',  'HCU Rassemblement',               'hcu rassemblement',               v_it, NULL, v_it_elite, v_it_elite, false, 'seed'),
    ('sg_amsicora_it',        'SG Amsicora',                      'sg amsicora',                      v_it, NULL, v_it_elite, v_it_elite, false, 'seed'),
    ('butterfly_roma_it',     'Butterfly Roma',                   'butterfly roma',                   v_it, NULL, v_it_elite, v_it_elite, false, 'seed'),
    ('lazio_hockey_it',       'Lazio Hockey',                     'lazio hockey',                     v_it, NULL, v_it_elite, v_it_elite, false, 'seed'),
    ('hf_lorenzoni_it',       'HF Lorenzoni',                     'hf lorenzoni',                     v_it, NULL, v_it_elite, v_it_elite, false, 'seed'),
    ('capitolina_it',         'Unione Hockey Capitolina ASD',     'unione hockey capitolina asd',     v_it, NULL, v_it_elite, v_it_elite, false, 'seed'),
    ('cus_torino_it',         'CUS Torino',                       'cus torino',                       v_it, NULL, v_it_elite, v_it_elite, false, 'seed'),
    ('milano_hp_it',          'Milano HP',                        'milano hp',                        v_it, NULL, v_it_elite, v_it_elite, false, 'seed'),
    ('bologna_it',            'Hockey Team Bologna',              'hockey team bologna',              v_it, NULL, v_it_elite, v_it_elite, false, 'seed'),
    ('tevere_eur_it',         'Tevere Eur H',                     'tevere eur h',                     v_it, NULL, v_it_elite, v_it_elite, false, 'seed'),
    ('pol_ferrini_it',        'Pol Ferrini',                      'pol ferrini',                      v_it, NULL, v_it_elite, v_it_elite, false, 'seed'),
    ('hc_bra_it',             'HC Bra',                           'hc bra',                           v_it, NULL, v_it_elite, v_it_elite, false, 'seed'),
    ('hp_valchisone_it',      'HP Valchisone',                    'hp valchisone',                    v_it, NULL, v_it_elite, v_it_elite, false, 'seed'),
    ('citta_tricolore_it',    'H Città del Tricolore',            'h città del tricolore',            v_it, NULL, v_it_elite, v_it_elite, false, 'seed'),
    ('hc_genova_it',          'Hockey Club Genova',               'hockey club genova',               v_it, NULL, v_it_elite, v_it_elite, false, 'seed')
  ON CONFLICT ON CONSTRAINT world_clubs_club_id_key DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RAISE NOTICE 'Italy: % clubs inserted', v_inserted;

  -- ==================================================================
  -- GERMANY (22 clubs)
  -- ==================================================================
  INSERT INTO world_clubs (club_id, club_name, club_name_normalized, country_id, province_id, men_league_id, women_league_id, is_claimed, created_from)
  VALUES
    ('hamburger_polo_de',     'Hamburger Polo Club',          'hamburger polo club',          v_de, NULL, v_de_bl1, v_de_bl1, false, 'seed'),
    ('tsv_mannheim_de',       'TSV Mannheim Hockey',          'tsv mannheim hockey',          v_de, NULL, v_de_bl1, v_de_bl1, false, 'seed'),
    ('uhlenhorst_de',         'Uhlenhorst Mülheim',           'uhlenhorst mülheim',           v_de, NULL, v_de_bl1, v_de_bl1, false, 'seed'),
    ('rw_koeln_de',           'RW Köln',                      'rw köln',                      v_de, NULL, v_de_bl1, v_de_bl1, false, 'seed'),
    ('alster_de',             'Der Club an der Alster',        'der club an der alster',        v_de, NULL, v_de_bl1, v_de_bl1, false, 'seed'),
    ('uhc_hamburg_de',        'UHC Hamburg',                   'uhc hamburg',                   v_de, NULL, v_de_bl1, v_de_bl1, false, 'seed'),
    ('mannheimer_hc_de',      'Mannheimer HC',                 'mannheimer hc',                 v_de, NULL, v_de_bl1, v_de_bl1, false, 'seed'),
    ('harvestehuder_de',      'Harvestehuder THC',             'harvestehuder thc',             v_de, NULL, v_de_bl1, v_de_bl1, false, 'seed'),
    ('crefelder_de',          'Crefelder HTC',                 'crefelder htc',                 v_de, NULL, v_de_bl1, v_de_bl1, false, 'seed'),
    ('gladbacher_de',         'Gladbacher HTC',                'gladbacher htc',                v_de, NULL, v_de_bl1, v_de_bl1, false, 'seed'),
    ('muenchner_sc_de',       'Münchner SC',                   'münchner sc',                   v_de, NULL, v_de_bl1, v_de_bl1, false, 'seed'),
    ('sc_frankfurt_de',       'SC Frankfurt 1880',             'sc frankfurt 1880',             v_de, NULL, v_de_bl1, v_de_bl1, false, 'seed'),
    ('dsd_duesseldorf_de',    'DSD Düsseldorf',                'dsd düsseldorf',                v_de, NULL, v_de_bl2, v_de_bl2, false, 'seed'),
    ('duesseldorfer_hc_de',   'Düsseldorfer HC',               'düsseldorfer hc',               v_de, NULL, v_de_bl2, v_de_bl2, false, 'seed'),
    ('grossflottbeker_de',    'Großlottbeker THGC',            'großlottbeker thgc',            v_de, NULL, v_de_bl2, v_de_bl2, false, 'seed'),
    ('raffelberg_de',         'Club Raffelberg',               'club raffelberg',               v_de, NULL, v_de_bl2, v_de_bl2, false, 'seed'),
    ('marienburger_de',       'Marienburger SC',               'marienburger sc',               v_de, NULL, v_de_bl2, v_de_bl2, false, 'seed'),
    ('dtv_hannover_de',       'DTV Hannover',                  'dtv hannover',                  v_de, NULL, v_de_bl2, v_de_bl2, false, 'seed'),
    ('sw_koeln_de',           'Schwarz-Weiß Köln',             'schwarz-weiß köln',             v_de, NULL, v_de_bl2, v_de_bl2, false, 'seed'),
    ('sw_neuss_de',           'HTC Schwarz-Weiß Neuss',        'htc schwarz-weiß neuss',        v_de, NULL, v_de_bl2, v_de_bl2, false, 'seed'),
    ('braunschweiger_de',     'Braunschweiger THC',            'braunschweiger thc',            v_de, NULL, v_de_bl2, v_de_bl2, false, 'seed'),
    ('bonner_thv_de',         'Bonner THV',                    'bonner thv',                    v_de, NULL, v_de_bl2, v_de_bl2, false, 'seed')
  ON CONFLICT ON CONSTRAINT world_clubs_club_id_key DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RAISE NOTICE 'Germany: % clubs inserted', v_inserted;

  -- ==================================================================
  -- SPAIN (15 clubs)
  -- ==================================================================
  INSERT INTO world_clubs (club_id, club_name, club_name_normalized, country_id, province_id, men_league_id, women_league_id, is_claimed, created_from)
  VALUES
    ('campo_madrid_es',       'Club de Campo Villa de Madrid',            'club de campo villa de madrid',            v_es, NULL, v_es_dh,  v_es_dha, false, 'seed'),
    ('sanse_es',              'Sanse Complutense',                        'sanse complutense',                        v_es, NULL, v_es_dh,  v_es_dha, false, 'seed'),
    ('taburiente_es',         'Unión Deportiva Taburiente',               'unión deportiva taburiente',               v_es, NULL, v_es_dh,  v_es_dha, false, 'seed'),
    ('egara_es',              'Club Egara',                               'club egara',                               v_es, NULL, v_es_dh,  v_es_dha, false, 'seed'),
    ('polo_es',               'Real Club de Polo',                        'real club de polo',                        v_es, NULL, v_es_dh,  v_es_dha, false, 'seed'),
    ('rs_hockey_fem_es',      'Real Sociedad Hockey Femenino',            'real sociedad hockey femenino',            v_es, NULL, NULL,     v_es_dha, false, 'seed'),
    ('terrassa_atl_es',       'Atlètic Terrassa Hockey Club',             'atlètic terrassa hockey club',             v_es, NULL, v_es_dh,  v_es_dha, false, 'seed'),
    ('junior_fc_es',          'Junior FC',                                'junior fc',                                v_es, NULL, v_es_dh,  v_es_dha, false, 'seed'),
    ('rs_tenis_es',           'RS Tenis (Real Sociedad de Tenis de la Magdalena)', 'rs tenis (real sociedad de tenis de la magdalena)', v_es, NULL, v_es_dh,  v_es_dha, false, 'seed'),
    ('sardinero_es',          'CH Sardinero',                             'ch sardinero',                             v_es, NULL, v_es_dhb, v_es_dha, false, 'seed'),
    ('castelldefels_es',      'Castelldefels Hockey Club',                'castelldefels hockey club',                v_es, NULL, NULL,     v_es_dha, false, 'seed'),
    ('barcelona_es',          'Fútbol Club Barcelona',                    'fútbol club barcelona',                    v_es, NULL, v_es_dh,  v_es_dhb, false, 'seed'),
    ('cd_terrassa_es',        'Club Deportiu Terrassa Hockey',            'club deportiu terrassa hockey',            v_es, NULL, v_es_dh,  NULL,     false, 'seed'),
    ('jolaseta_es',           'Real Club Jolaseta',                       'real club jolaseta',                       v_es, NULL, v_es_dh,  v_es_dhb, false, 'seed'),
    ('las_rozas_es',          'CHM Las Rozas / Las Rozas HC',             'chm las rozas / las rozas hc',             v_es, NULL, v_es_dh,  NULL,     false, 'seed')
  ON CONFLICT ON CONSTRAINT world_clubs_club_id_key DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RAISE NOTICE 'Spain: % clubs inserted', v_inserted;

  -- ==================================================================
  -- BELGIUM (16 clubs)
  -- ==================================================================
  INSERT INTO world_clubs (club_id, club_name, club_name_normalized, country_id, province_id, men_league_id, women_league_id, is_claimed, created_from)
  VALUES
    ('beerschot_be',      'Beerschot',       'beerschot',       v_be, NULL, v_be_m,  v_be_n1, false, 'seed'),
    ('braxgata_be',       'Braxgata',        'braxgata',        v_be, NULL, v_be_m,  v_be_w,  false, 'seed'),
    ('dragons_be',        'Dragons',         'dragons',         v_be, NULL, v_be_m,  v_be_w,  false, 'seed'),
    ('gantoise_be',       'Gantoise',        'gantoise',        v_be, NULL, v_be_m,  v_be_w,  false, 'seed'),
    ('herakles_be',       'Herakles',        'herakles',        v_be, NULL, v_be_m,  v_be_w,  false, 'seed'),
    ('leopold_be',        'Léopold',         'léopold',         v_be, NULL, v_be_m,  v_be_w,  false, 'seed'),
    ('old_club_be',       'Old Club',        'old club',        v_be, NULL, v_be_m,  v_be_n1, false, 'seed'),
    ('oree_be',           'Orée',            'orée',            v_be, NULL, v_be_m,  v_be_w,  false, 'seed'),
    ('pingouin_be',       'Pingouin',        'pingouin',        v_be, NULL, v_be_m,  v_be_n1, false, 'seed'),
    ('racing_be',         'Racing',          'racing',          v_be, NULL, v_be_m,  v_be_w,  false, 'seed'),
    ('uccle_sport_be',    'Uccle Sport',     'uccle sport',     v_be, NULL, v_be_m,  v_be_n1, false, 'seed'),
    ('waterloo_ducks_be', 'Waterloo Ducks',  'waterloo ducks',  v_be, NULL, v_be_m,  v_be_w,  false, 'seed'),
    ('antwerp_be',        'Antwerp',         'antwerp',         v_be, NULL, v_be_n1, v_be_w,  false, 'seed'),
    ('leuven_be',         'Leuven',          'leuven',          v_be, NULL, v_be_n1, v_be_w,  false, 'seed'),
    ('victory_be',        'Victory',         'victory',         v_be, NULL, v_be_n1, v_be_w,  false, 'seed'),
    ('wellington_be',     'Wellington',       'wellington',       v_be, NULL, v_be_n1, v_be_w,  false, 'seed')
  ON CONFLICT ON CONSTRAINT world_clubs_club_id_key DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RAISE NOTICE 'Belgium: % clubs inserted', v_inserted;

  -- ==================================================================
  -- ENGLAND (12 clubs)
  -- ==================================================================
  INSERT INTO world_clubs (club_id, club_name, club_name_normalized, country_id, province_id, men_league_id, women_league_id, is_claimed, created_from)
  VALUES
    ('reading_en',          'Reading',                   'reading',                   v_en, NULL, v_en_pd,  v_en_pd,  false, 'seed'),
    ('surbiton_en',         'Surbiton',                  'surbiton',                  v_en, NULL, v_en_pd,  v_en_pd,  false, 'seed'),
    ('east_grinstead_en',   'East Grinstead',            'east grinstead',            v_en, NULL, v_en_pd,  v_en_pd,  false, 'seed'),
    ('hampstead_en',        'Hampstead & Westminster',   'hampstead & westminster',   v_en, NULL, v_en_pd,  v_en_pd,  false, 'seed'),
    ('wimbledon_en',        'Wimbledon',                 'wimbledon',                 v_en, NULL, v_en_pd,  v_en_pd,  false, 'seed'),
    ('loughborough_en',     'Loughborough Students',     'loughborough students',     v_en, NULL, v_en_pd,  v_en_pd,  false, 'seed'),
    ('clifton_en',          'Clifton Robinsons',         'clifton robinsons',         v_en, NULL, v_en_pd,  v_en_pd,  false, 'seed'),
    ('bowdon_en',           'Bowdon',                    'bowdon',                    v_en, NULL, v_en_pd,  v_en_pd,  false, 'seed'),
    ('bham_uni_en',         'University of Birmingham',  'university of birmingham',  v_en, NULL, v_en_pd,  v_en_pd,  false, 'seed'),
    ('nott_uni_en',         'University of Nottingham',  'university of nottingham',  v_en, NULL, v_en_pd,  v_en_pd,  false, 'seed'),
    ('sutton_en',           'Sutton Coldfield',          'sutton coldfield',          v_en, NULL, v_en_pd,  v_en_pd,  false, 'seed'),
    ('holcombe_en',         'Holcombe',                  'holcombe',                  v_en, NULL, v_en_pd,  v_en_d1s, false, 'seed')
  ON CONFLICT ON CONSTRAINT world_clubs_club_id_key DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RAISE NOTICE 'England: % clubs inserted', v_inserted;

  -- ==================================================================
  -- AUSTRALIA — National (7 clubs)
  -- ==================================================================
  INSERT INTO world_clubs (club_id, club_name, club_name_normalized, country_id, province_id, men_league_id, women_league_id, is_claimed, created_from)
  VALUES
    ('adelaide_fire_au',    'Adelaide Fire',        'adelaide fire',        v_au, v_au_nat, v_au_hol, v_au_hol, false, 'seed'),
    ('brisbane_blaze_au',   'Brisbane Blaze',       'brisbane blaze',       v_au, v_au_nat, v_au_hol, v_au_hol, false, 'seed'),
    ('canberra_chill_au',   'Canberra Chill',       'canberra chill',       v_au, v_au_nat, v_au_hol, v_au_hol, false, 'seed'),
    ('hc_melbourne_au',     'HC Melbourne',         'hc melbourne',         v_au, v_au_nat, v_au_hol, v_au_hol, false, 'seed'),
    ('nsw_pride_au',        'NSW Pride',            'nsw pride',            v_au, v_au_nat, v_au_hol, v_au_hol, false, 'seed'),
    ('perth_thunder_au',    'Perth Thundersticks',  'perth thundersticks',  v_au, v_au_nat, v_au_hol, v_au_hol, false, 'seed'),
    ('tassie_tigers_au',    'Tassie Tigers',        'tassie tigers',        v_au, v_au_nat, v_au_hol, v_au_hol, false, 'seed')
  ON CONFLICT ON CONSTRAINT world_clubs_club_id_key DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RAISE NOTICE 'Australia National: % clubs inserted', v_inserted;

  -- ==================================================================
  -- AUSTRALIA — Victoria (13 clubs)
  -- ==================================================================
  INSERT INTO world_clubs (club_id, club_name, club_name_normalized, country_id, province_id, men_league_id, women_league_id, is_claimed, created_from)
  VALUES
    ('southern_utd_au_vic',   'Southern United Hockey Club',              'southern united hockey club',              v_au, v_au_vic, v_au_vic_pl,  v_au_vic_vl2, false, 'seed'),
    ('essendon_au_vic',       'Essendon Hockey',                         'essendon hockey',                         v_au, v_au_vic, v_au_vic_pl,  v_au_vic_pl,  false, 'seed'),
    ('mentone_au_vic',        'Mentone Hockey Club',                     'mentone hockey club',                     v_au, v_au_vic, v_au_vic_vl1, v_au_vic_pl,  false, 'seed'),
    ('camberwell_au_vic',     'Camberwell Hockey Club',                  'camberwell hockey club',                  v_au, v_au_vic, v_au_vic_pl,  v_au_vic_pl,  false, 'seed'),
    ('waverley_au_vic',       'Waverley Hockey Club',                    'waverley hockey club',                    v_au, v_au_vic, v_au_vic_pl,  v_au_vic_pl,  false, 'seed'),
    ('altona_au_vic',         'Altona Hockey Club',                      'altona hockey club',                      v_au, v_au_vic, v_au_vic_pl,  v_au_vic_pl,  false, 'seed'),
    ('footscray_au_vic',      'Footscray Hockey Club',                   'footscray hockey club',                   v_au, v_au_vic, v_au_vic_pl,  v_au_vic_pl,  false, 'seed'),
    ('doncaster_au_vic',      'Doncaster Hockey Club',                   'doncaster hockey club',                   v_au, v_au_vic, v_au_vic_pl,  v_au_vic_pl,  false, 'seed'),
    ('bayside_au_vic',        'Bayside Powerhouse Saints Hockey Club',   'bayside powerhouse saints hockey club',   v_au, v_au_vic, v_au_vic_vl1, v_au_vic_pl,  false, 'seed'),
    ('tem_au_vic',            'Toorak East Malvern Hockey Club',         'toorak east malvern hockey club',         v_au, v_au_vic, v_au_vic_pl,  v_au_vic_pl,  false, 'seed'),
    ('kbh_au_vic',            'KBH Brumbies Hockey Club',                'kbh brumbies hockey club',                v_au, v_au_vic, v_au_vic_pl,  v_au_vic_pl,  false, 'seed'),
    ('mcc_au_vic',            'MCC Hockey Section',                      'mcc hockey section',                      v_au, v_au_vic, v_au_vic_pl,  v_au_vic_vl1, false, 'seed'),
    ('greensborough_au_vic',  'Greensborough Hockey Club',               'greensborough hockey club',               v_au, v_au_vic, v_au_vic_pl,  v_au_vic_vl1, false, 'seed')
  ON CONFLICT ON CONSTRAINT world_clubs_club_id_key DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RAISE NOTICE 'Australia Victoria: % clubs inserted', v_inserted;

  -- ==================================================================
  -- AUSTRALIA — Western Australia (12 clubs)
  -- ==================================================================
  INSERT INTO world_clubs (club_id, club_name, club_name_normalized, country_id, province_id, men_league_id, women_league_id, is_claimed, created_from)
  VALUES
    ('westside_au_wa',     'Westside Wolves',                  'westside wolves',                  v_au, v_au_wa, v_au_wa_pl, v_au_wa_pl, false, 'seed'),
    ('ymca_au_wa',         'YMCA Coastal City',                'ymca coastal city',                v_au, v_au_wa, v_au_wa_pl, v_au_wa_pl, false, 'seed'),
    ('suburban_au_wa',     'Suburban Lions Hockey Club',        'suburban lions hockey club',        v_au, v_au_wa, v_au_wa_pl, v_au_wa_pl, false, 'seed'),
    ('uwa_au_wa',          'UWA Hockey Club',                  'uwa hockey club',                  v_au, v_au_wa, v_au_wa_pl, v_au_wa_pl, false, 'seed'),
    ('north_coast_au_wa',  'North Coast Raiders',              'north coast raiders',              v_au, v_au_wa, v_au_wa_pl, v_au_wa_pl, false, 'seed'),
    ('curtin_au_wa',       'Curtin University Hockey Club',    'curtin university hockey club',    v_au, v_au_wa, v_au_wa_pl, v_au_wa_pl, false, 'seed'),
    ('reds_au_wa',         'Reds Hockey Club',                 'reds hockey club',                 v_au, v_au_wa, v_au_wa_pl, v_au_wa_pl, false, 'seed'),
    ('wasps_au_wa',        'Wesley South Perth (WASPS)',        'wesley south perth (wasps)',        v_au, v_au_wa, v_au_wa_pl, v_au_wa_pl, false, 'seed'),
    ('mods_ogm_au_wa',     'Mods-OGM',                        'mods-ogm',                        v_au, v_au_wa, v_au_wa_pl, v_au_wa_pl, false, 'seed'),
    ('vic_park_au_wa',     'Victoria Park Panthers',           'victoria park panthers',           v_au, v_au_wa, v_au_wa_pl, v_au_wa_pl, false, 'seed'),
    ('freo_au_wa',         'Fremantle-Cockburn',               'fremantle-cockburn',               v_au, v_au_wa, v_au_wa_pl, v_au_wa_pl, false, 'seed'),
    ('hale_au_wa',         'Hale',                             'hale',                             v_au, v_au_wa, v_au_wa_pl, v_au_wa_pl, false, 'seed')
  ON CONFLICT ON CONSTRAINT world_clubs_club_id_key DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RAISE NOTICE 'Australia Western Australia: % clubs inserted', v_inserted;
END;
$$;

-- ============================================================================
-- PHASE 3: Mark pre-claimed clubs and sync to profiles
-- ============================================================================
-- These clubs were already claimed by known users before mass seeding.
-- We set is_claimed, claimed_profile_id, claimed_at on the world_clubs row,
-- and sync league info to the profiles table.
DO $$
DECLARE
  v_claim RECORD;
  v_profile_exists BOOLEAN;
  v_men_league_name TEXT;
  v_women_league_name TEXT;
  v_claimed_count INT := 0;
BEGIN
  -- Pre-claimed clubs: only claim if the profile exists in this database
  -- (profile UUIDs may differ between staging and production)
  FOR v_claim IN
    SELECT * FROM (VALUES
      ('casi_ar_ba',            'f498666b-b8f3-4190-a4f3-67f5ef9a1423'::uuid),
      ('oldchristians_uy',      '0c010e37-3196-4425-b6ad-4984c3f4b989'::uuid),
      ('hcu_rassemblement_it',  '84193575-c833-4a70-bd46-d213d6e2c445'::uuid),
      ('capitolina_it',         'e9cee650-1a4c-442b-a5a0-d8426dfd69de'::uuid),
      ('cus_torino_it',         'fd64497b-bf1f-4dbc-b07e-7b4b2c1a3672'::uuid),
      ('bologna_it',            '46b5529f-aed9-490b-b33b-1f4afb4c78d6'::uuid),
      ('castelldefels_es',      '3a255eb2-0c2d-4125-be78-d1bb8ab25ada'::uuid)
    ) AS t(club_id, profile_id)
  LOOP
    SELECT EXISTS(SELECT 1 FROM profiles WHERE id = v_claim.profile_id) INTO v_profile_exists;

    IF v_profile_exists THEN
      UPDATE world_clubs SET
        is_claimed = true,
        claimed_profile_id = v_claim.profile_id,
        claimed_at = timezone('utc', now())
      WHERE club_id = v_claim.club_id;

      -- Sync league info to the profile
      SELECT name INTO v_men_league_name
        FROM world_leagues WHERE id = (SELECT men_league_id FROM world_clubs WHERE club_id = v_claim.club_id);
      SELECT name INTO v_women_league_name
        FROM world_leagues WHERE id = (SELECT women_league_id FROM world_clubs WHERE club_id = v_claim.club_id);

      UPDATE profiles SET
        mens_league_id = (SELECT men_league_id FROM world_clubs WHERE club_id = v_claim.club_id),
        womens_league_id = (SELECT women_league_id FROM world_clubs WHERE club_id = v_claim.club_id),
        world_region_id = (SELECT province_id FROM world_clubs WHERE club_id = v_claim.club_id),
        mens_league_division = v_men_league_name,
        womens_league_division = v_women_league_name
      WHERE id = v_claim.profile_id;

      v_claimed_count := v_claimed_count + 1;
    ELSE
      RAISE NOTICE 'Skipping claim for % — profile % not found', v_claim.club_id, v_claim.profile_id;
    END IF;
  END LOOP;

  RAISE NOTICE 'Phase 3 complete: % clubs claimed (% skipped)', v_claimed_count, 7 - v_claimed_count;
END;
$$;

COMMIT;
