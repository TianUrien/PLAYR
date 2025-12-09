-- Countries Normalization Migration
-- Adds structured country data for nationality, passports, and base country
-- Migrates existing free-text values to normalized country IDs

BEGIN;

-- ============================================================================
-- STEP 1: Enable pg_trgm for fuzzy matching
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- STEP 2: Create countries reference table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.countries (
  id SERIAL PRIMARY KEY,
  code CHAR(2) NOT NULL UNIQUE,           -- ISO 3166-1 alpha-2
  code_alpha3 CHAR(3) NOT NULL UNIQUE,    -- ISO 3166-1 alpha-3
  name TEXT NOT NULL,                      -- Official name
  common_name TEXT,                        -- Common name if different
  nationality_name TEXT NOT NULL,          -- Demonym (e.g., "Argentine")
  region TEXT,                             -- Geographic region
  flag_emoji TEXT,                         -- Flag emoji for UI
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_countries_name ON public.countries (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_countries_nationality ON public.countries (LOWER(nationality_name));
CREATE INDEX IF NOT EXISTS idx_countries_name_trgm ON public.countries USING gin (name gin_trgm_ops);

COMMENT ON TABLE public.countries IS 'ISO 3166-1 country reference table for structured nationality/passport data';

-- ============================================================================
-- STEP 3: Populate countries table with ISO 3166-1 data
-- ============================================================================
INSERT INTO public.countries (code, code_alpha3, name, nationality_name, region, flag_emoji) VALUES
-- Europe
('AL', 'ALB', 'Albania', 'Albanian', 'Europe', '🇦🇱'),
('AD', 'AND', 'Andorra', 'Andorran', 'Europe', '🇦🇩'),
('AT', 'AUT', 'Austria', 'Austrian', 'Europe', '🇦🇹'),
('BY', 'BLR', 'Belarus', 'Belarusian', 'Europe', '🇧🇾'),
('BE', 'BEL', 'Belgium', 'Belgian', 'Europe', '🇧🇪'),
('BA', 'BIH', 'Bosnia and Herzegovina', 'Bosnian', 'Europe', '🇧🇦'),
('BG', 'BGR', 'Bulgaria', 'Bulgarian', 'Europe', '🇧🇬'),
('HR', 'HRV', 'Croatia', 'Croatian', 'Europe', '🇭🇷'),
('CY', 'CYP', 'Cyprus', 'Cypriot', 'Europe', '🇨🇾'),
('CZ', 'CZE', 'Czech Republic', 'Czech', 'Europe', '🇨🇿'),
('DK', 'DNK', 'Denmark', 'Danish', 'Europe', '🇩🇰'),
('EE', 'EST', 'Estonia', 'Estonian', 'Europe', '🇪🇪'),
('FI', 'FIN', 'Finland', 'Finnish', 'Europe', '🇫🇮'),
('FR', 'FRA', 'France', 'French', 'Europe', '🇫🇷'),
('DE', 'DEU', 'Germany', 'German', 'Europe', '🇩🇪'),
('GR', 'GRC', 'Greece', 'Greek', 'Europe', '🇬🇷'),
('HU', 'HUN', 'Hungary', 'Hungarian', 'Europe', '🇭🇺'),
('IS', 'ISL', 'Iceland', 'Icelandic', 'Europe', '🇮🇸'),
('IE', 'IRL', 'Ireland', 'Irish', 'Europe', '🇮🇪'),
('IT', 'ITA', 'Italy', 'Italian', 'Europe', '🇮🇹'),
('XK', 'XKX', 'Kosovo', 'Kosovar', 'Europe', '🇽🇰'),
('LV', 'LVA', 'Latvia', 'Latvian', 'Europe', '🇱🇻'),
('LI', 'LIE', 'Liechtenstein', 'Liechtensteiner', 'Europe', '🇱🇮'),
('LT', 'LTU', 'Lithuania', 'Lithuanian', 'Europe', '🇱🇹'),
('LU', 'LUX', 'Luxembourg', 'Luxembourgish', 'Europe', '🇱🇺'),
('MT', 'MLT', 'Malta', 'Maltese', 'Europe', '🇲🇹'),
('MD', 'MDA', 'Moldova', 'Moldovan', 'Europe', '🇲🇩'),
('MC', 'MCO', 'Monaco', 'Monegasque', 'Europe', '🇲🇨'),
('ME', 'MNE', 'Montenegro', 'Montenegrin', 'Europe', '🇲🇪'),
('NL', 'NLD', 'Netherlands', 'Dutch', 'Europe', '🇳🇱'),
('MK', 'MKD', 'North Macedonia', 'Macedonian', 'Europe', '🇲🇰'),
('NO', 'NOR', 'Norway', 'Norwegian', 'Europe', '🇳🇴'),
('PL', 'POL', 'Poland', 'Polish', 'Europe', '🇵🇱'),
('PT', 'PRT', 'Portugal', 'Portuguese', 'Europe', '🇵🇹'),
('RO', 'ROU', 'Romania', 'Romanian', 'Europe', '🇷🇴'),
('RU', 'RUS', 'Russia', 'Russian', 'Europe', '🇷🇺'),
('SM', 'SMR', 'San Marino', 'Sammarinese', 'Europe', '🇸🇲'),
('RS', 'SRB', 'Serbia', 'Serbian', 'Europe', '🇷🇸'),
('SK', 'SVK', 'Slovakia', 'Slovak', 'Europe', '🇸🇰'),
('SI', 'SVN', 'Slovenia', 'Slovenian', 'Europe', '🇸🇮'),
('ES', 'ESP', 'Spain', 'Spanish', 'Europe', '🇪🇸'),
('SE', 'SWE', 'Sweden', 'Swedish', 'Europe', '🇸🇪'),
('CH', 'CHE', 'Switzerland', 'Swiss', 'Europe', '🇨🇭'),
('TR', 'TUR', 'Turkey', 'Turkish', 'Europe', '🇹🇷'),
('UA', 'UKR', 'Ukraine', 'Ukrainian', 'Europe', '🇺🇦'),
('GB', 'GBR', 'United Kingdom', 'British', 'Europe', '🇬🇧'),
('VA', 'VAT', 'Vatican City', 'Vatican', 'Europe', '🇻🇦'),

-- South America
('AR', 'ARG', 'Argentina', 'Argentine', 'South America', '🇦🇷'),
('BO', 'BOL', 'Bolivia', 'Bolivian', 'South America', '🇧🇴'),
('BR', 'BRA', 'Brazil', 'Brazilian', 'South America', '🇧🇷'),
('CL', 'CHL', 'Chile', 'Chilean', 'South America', '🇨🇱'),
('CO', 'COL', 'Colombia', 'Colombian', 'South America', '🇨🇴'),
('EC', 'ECU', 'Ecuador', 'Ecuadorian', 'South America', '🇪🇨'),
('GY', 'GUY', 'Guyana', 'Guyanese', 'South America', '🇬🇾'),
('PY', 'PRY', 'Paraguay', 'Paraguayan', 'South America', '🇵🇾'),
('PE', 'PER', 'Peru', 'Peruvian', 'South America', '🇵🇪'),
('SR', 'SUR', 'Suriname', 'Surinamese', 'South America', '🇸🇷'),
('UY', 'URY', 'Uruguay', 'Uruguayan', 'South America', '🇺🇾'),
('VE', 'VEN', 'Venezuela', 'Venezuelan', 'South America', '🇻🇪'),

-- North America
('CA', 'CAN', 'Canada', 'Canadian', 'North America', '🇨🇦'),
('MX', 'MEX', 'Mexico', 'Mexican', 'North America', '🇲🇽'),
('US', 'USA', 'United States', 'American', 'North America', '🇺🇸'),

-- Central America & Caribbean
('BZ', 'BLZ', 'Belize', 'Belizean', 'Central America', '🇧🇿'),
('CR', 'CRI', 'Costa Rica', 'Costa Rican', 'Central America', '🇨🇷'),
('SV', 'SLV', 'El Salvador', 'Salvadoran', 'Central America', '🇸🇻'),
('GT', 'GTM', 'Guatemala', 'Guatemalan', 'Central America', '🇬🇹'),
('HN', 'HND', 'Honduras', 'Honduran', 'Central America', '🇭🇳'),
('NI', 'NIC', 'Nicaragua', 'Nicaraguan', 'Central America', '🇳🇮'),
('PA', 'PAN', 'Panama', 'Panamanian', 'Central America', '🇵🇦'),
('AG', 'ATG', 'Antigua and Barbuda', 'Antiguan', 'Caribbean', '🇦🇬'),
('BS', 'BHS', 'Bahamas', 'Bahamian', 'Caribbean', '🇧🇸'),
('BB', 'BRB', 'Barbados', 'Barbadian', 'Caribbean', '🇧🇧'),
('CU', 'CUB', 'Cuba', 'Cuban', 'Caribbean', '🇨🇺'),
('DM', 'DMA', 'Dominica', 'Dominican', 'Caribbean', '🇩🇲'),
('DO', 'DOM', 'Dominican Republic', 'Dominican', 'Caribbean', '🇩🇴'),
('GD', 'GRD', 'Grenada', 'Grenadian', 'Caribbean', '🇬🇩'),
('HT', 'HTI', 'Haiti', 'Haitian', 'Caribbean', '🇭🇹'),
('JM', 'JAM', 'Jamaica', 'Jamaican', 'Caribbean', '🇯🇲'),
('KN', 'KNA', 'Saint Kitts and Nevis', 'Kittitian', 'Caribbean', '🇰🇳'),
('LC', 'LCA', 'Saint Lucia', 'Saint Lucian', 'Caribbean', '🇱🇨'),
('VC', 'VCT', 'Saint Vincent and the Grenadines', 'Vincentian', 'Caribbean', '🇻🇨'),
('TT', 'TTO', 'Trinidad and Tobago', 'Trinidadian', 'Caribbean', '🇹🇹'),
('PR', 'PRI', 'Puerto Rico', 'Puerto Rican', 'Caribbean', '🇵🇷'),

-- Africa
('DZ', 'DZA', 'Algeria', 'Algerian', 'Africa', '🇩🇿'),
('AO', 'AGO', 'Angola', 'Angolan', 'Africa', '🇦🇴'),
('BJ', 'BEN', 'Benin', 'Beninese', 'Africa', '🇧🇯'),
('BW', 'BWA', 'Botswana', 'Motswana', 'Africa', '🇧🇼'),
('BF', 'BFA', 'Burkina Faso', 'Burkinabé', 'Africa', '🇧🇫'),
('BI', 'BDI', 'Burundi', 'Burundian', 'Africa', '🇧🇮'),
('CV', 'CPV', 'Cabo Verde', 'Cape Verdean', 'Africa', '🇨🇻'),
('CM', 'CMR', 'Cameroon', 'Cameroonian', 'Africa', '🇨🇲'),
('CF', 'CAF', 'Central African Republic', 'Central African', 'Africa', '🇨🇫'),
('TD', 'TCD', 'Chad', 'Chadian', 'Africa', '🇹🇩'),
('KM', 'COM', 'Comoros', 'Comorian', 'Africa', '🇰🇲'),
('CG', 'COG', 'Congo', 'Congolese', 'Africa', '🇨🇬'),
('CD', 'COD', 'Democratic Republic of the Congo', 'Congolese', 'Africa', '🇨🇩'),
('DJ', 'DJI', 'Djibouti', 'Djiboutian', 'Africa', '🇩🇯'),
('EG', 'EGY', 'Egypt', 'Egyptian', 'Africa', '🇪🇬'),
('GQ', 'GNQ', 'Equatorial Guinea', 'Equatoguinean', 'Africa', '🇬🇶'),
('ER', 'ERI', 'Eritrea', 'Eritrean', 'Africa', '🇪🇷'),
('SZ', 'SWZ', 'Eswatini', 'Swazi', 'Africa', '🇸🇿'),
('ET', 'ETH', 'Ethiopia', 'Ethiopian', 'Africa', '🇪🇹'),
('GA', 'GAB', 'Gabon', 'Gabonese', 'Africa', '🇬🇦'),
('GM', 'GMB', 'Gambia', 'Gambian', 'Africa', '🇬🇲'),
('GH', 'GHA', 'Ghana', 'Ghanaian', 'Africa', '🇬🇭'),
('GN', 'GIN', 'Guinea', 'Guinean', 'Africa', '🇬🇳'),
('GW', 'GNB', 'Guinea-Bissau', 'Bissau-Guinean', 'Africa', '🇬🇼'),
('CI', 'CIV', 'Ivory Coast', 'Ivorian', 'Africa', '🇨🇮'),
('KE', 'KEN', 'Kenya', 'Kenyan', 'Africa', '🇰🇪'),
('LS', 'LSO', 'Lesotho', 'Mosotho', 'Africa', '🇱🇸'),
('LR', 'LBR', 'Liberia', 'Liberian', 'Africa', '🇱🇷'),
('LY', 'LBY', 'Libya', 'Libyan', 'Africa', '🇱🇾'),
('MG', 'MDG', 'Madagascar', 'Malagasy', 'Africa', '🇲🇬'),
('MW', 'MWI', 'Malawi', 'Malawian', 'Africa', '🇲🇼'),
('ML', 'MLI', 'Mali', 'Malian', 'Africa', '🇲🇱'),
('MR', 'MRT', 'Mauritania', 'Mauritanian', 'Africa', '🇲🇷'),
('MU', 'MUS', 'Mauritius', 'Mauritian', 'Africa', '🇲🇺'),
('MA', 'MAR', 'Morocco', 'Moroccan', 'Africa', '🇲🇦'),
('MZ', 'MOZ', 'Mozambique', 'Mozambican', 'Africa', '🇲🇿'),
('NA', 'NAM', 'Namibia', 'Namibian', 'Africa', '🇳🇦'),
('NE', 'NER', 'Niger', 'Nigerien', 'Africa', '🇳🇪'),
('NG', 'NGA', 'Nigeria', 'Nigerian', 'Africa', '🇳🇬'),
('RW', 'RWA', 'Rwanda', 'Rwandan', 'Africa', '🇷🇼'),
('ST', 'STP', 'Sao Tome and Principe', 'São Toméan', 'Africa', '🇸🇹'),
('SN', 'SEN', 'Senegal', 'Senegalese', 'Africa', '🇸🇳'),
('SC', 'SYC', 'Seychelles', 'Seychellois', 'Africa', '🇸🇨'),
('SL', 'SLE', 'Sierra Leone', 'Sierra Leonean', 'Africa', '🇸🇱'),
('SO', 'SOM', 'Somalia', 'Somali', 'Africa', '🇸🇴'),
('ZA', 'ZAF', 'South Africa', 'South African', 'Africa', '🇿🇦'),
('SS', 'SSD', 'South Sudan', 'South Sudanese', 'Africa', '🇸🇸'),
('SD', 'SDN', 'Sudan', 'Sudanese', 'Africa', '🇸🇩'),
('TZ', 'TZA', 'Tanzania', 'Tanzanian', 'Africa', '🇹🇿'),
('TG', 'TGO', 'Togo', 'Togolese', 'Africa', '🇹🇬'),
('TN', 'TUN', 'Tunisia', 'Tunisian', 'Africa', '🇹🇳'),
('UG', 'UGA', 'Uganda', 'Ugandan', 'Africa', '🇺🇬'),
('ZM', 'ZMB', 'Zambia', 'Zambian', 'Africa', '🇿🇲'),
('ZW', 'ZWE', 'Zimbabwe', 'Zimbabwean', 'Africa', '🇿🇼'),

-- Asia
('AF', 'AFG', 'Afghanistan', 'Afghan', 'Asia', '🇦🇫'),
('AM', 'ARM', 'Armenia', 'Armenian', 'Asia', '🇦🇲'),
('AZ', 'AZE', 'Azerbaijan', 'Azerbaijani', 'Asia', '🇦🇿'),
('BH', 'BHR', 'Bahrain', 'Bahraini', 'Asia', '🇧🇭'),
('BD', 'BGD', 'Bangladesh', 'Bangladeshi', 'Asia', '🇧🇩'),
('BT', 'BTN', 'Bhutan', 'Bhutanese', 'Asia', '🇧🇹'),
('BN', 'BRN', 'Brunei', 'Bruneian', 'Asia', '🇧🇳'),
('KH', 'KHM', 'Cambodia', 'Cambodian', 'Asia', '🇰🇭'),
('CN', 'CHN', 'China', 'Chinese', 'Asia', '🇨🇳'),
('GE', 'GEO', 'Georgia', 'Georgian', 'Asia', '🇬🇪'),
('IN', 'IND', 'India', 'Indian', 'Asia', '🇮🇳'),
('ID', 'IDN', 'Indonesia', 'Indonesian', 'Asia', '🇮🇩'),
('IR', 'IRN', 'Iran', 'Iranian', 'Asia', '🇮🇷'),
('IQ', 'IRQ', 'Iraq', 'Iraqi', 'Asia', '🇮🇶'),
('IL', 'ISR', 'Israel', 'Israeli', 'Asia', '🇮🇱'),
('JP', 'JPN', 'Japan', 'Japanese', 'Asia', '🇯🇵'),
('JO', 'JOR', 'Jordan', 'Jordanian', 'Asia', '🇯🇴'),
('KZ', 'KAZ', 'Kazakhstan', 'Kazakhstani', 'Asia', '🇰🇿'),
('KW', 'KWT', 'Kuwait', 'Kuwaiti', 'Asia', '🇰🇼'),
('KG', 'KGZ', 'Kyrgyzstan', 'Kyrgyz', 'Asia', '🇰🇬'),
('LA', 'LAO', 'Laos', 'Lao', 'Asia', '🇱🇦'),
('LB', 'LBN', 'Lebanon', 'Lebanese', 'Asia', '🇱🇧'),
('MY', 'MYS', 'Malaysia', 'Malaysian', 'Asia', '🇲🇾'),
('MV', 'MDV', 'Maldives', 'Maldivian', 'Asia', '🇲🇻'),
('MN', 'MNG', 'Mongolia', 'Mongolian', 'Asia', '🇲🇳'),
('MM', 'MMR', 'Myanmar', 'Burmese', 'Asia', '🇲🇲'),
('NP', 'NPL', 'Nepal', 'Nepali', 'Asia', '🇳🇵'),
('KP', 'PRK', 'North Korea', 'North Korean', 'Asia', '🇰🇵'),
('OM', 'OMN', 'Oman', 'Omani', 'Asia', '🇴🇲'),
('PK', 'PAK', 'Pakistan', 'Pakistani', 'Asia', '🇵🇰'),
('PS', 'PSE', 'Palestine', 'Palestinian', 'Asia', '🇵🇸'),
('PH', 'PHL', 'Philippines', 'Filipino', 'Asia', '🇵🇭'),
('QA', 'QAT', 'Qatar', 'Qatari', 'Asia', '🇶🇦'),
('SA', 'SAU', 'Saudi Arabia', 'Saudi', 'Asia', '🇸🇦'),
('SG', 'SGP', 'Singapore', 'Singaporean', 'Asia', '🇸🇬'),
('KR', 'KOR', 'South Korea', 'South Korean', 'Asia', '🇰🇷'),
('LK', 'LKA', 'Sri Lanka', 'Sri Lankan', 'Asia', '🇱🇰'),
('SY', 'SYR', 'Syria', 'Syrian', 'Asia', '🇸🇾'),
('TW', 'TWN', 'Taiwan', 'Taiwanese', 'Asia', '🇹🇼'),
('TJ', 'TJK', 'Tajikistan', 'Tajik', 'Asia', '🇹🇯'),
('TH', 'THA', 'Thailand', 'Thai', 'Asia', '🇹🇭'),
('TL', 'TLS', 'Timor-Leste', 'Timorese', 'Asia', '🇹🇱'),
('TM', 'TKM', 'Turkmenistan', 'Turkmen', 'Asia', '🇹🇲'),
('AE', 'ARE', 'United Arab Emirates', 'Emirati', 'Asia', '🇦🇪'),
('UZ', 'UZB', 'Uzbekistan', 'Uzbek', 'Asia', '🇺🇿'),
('VN', 'VNM', 'Vietnam', 'Vietnamese', 'Asia', '🇻🇳'),
('YE', 'YEM', 'Yemen', 'Yemeni', 'Asia', '🇾🇪'),

-- Oceania
('AU', 'AUS', 'Australia', 'Australian', 'Oceania', '🇦🇺'),
('FJ', 'FJI', 'Fiji', 'Fijian', 'Oceania', '🇫🇯'),
('KI', 'KIR', 'Kiribati', 'I-Kiribati', 'Oceania', '🇰🇮'),
('MH', 'MHL', 'Marshall Islands', 'Marshallese', 'Oceania', '🇲🇭'),
('FM', 'FSM', 'Micronesia', 'Micronesian', 'Oceania', '🇫🇲'),
('NR', 'NRU', 'Nauru', 'Nauruan', 'Oceania', '🇳🇷'),
('NZ', 'NZL', 'New Zealand', 'New Zealander', 'Oceania', '🇳🇿'),
('PW', 'PLW', 'Palau', 'Palauan', 'Oceania', '🇵🇼'),
('PG', 'PNG', 'Papua New Guinea', 'Papua New Guinean', 'Oceania', '🇵🇬'),
('WS', 'WSM', 'Samoa', 'Samoan', 'Oceania', '🇼🇸'),
('SB', 'SLB', 'Solomon Islands', 'Solomon Islander', 'Oceania', '🇸🇧'),
('TO', 'TON', 'Tonga', 'Tongan', 'Oceania', '🇹🇴'),
('TV', 'TUV', 'Tuvalu', 'Tuvaluan', 'Oceania', '🇹🇻'),
('VU', 'VUT', 'Vanuatu', 'Ni-Vanuatu', 'Oceania', '🇻🇺')

ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- STEP 4: Create country text aliases table for mapping messy data
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.country_text_aliases (
  id SERIAL PRIMARY KEY,
  alias_text TEXT NOT NULL,                -- Lowercase alias (e.g., "arg", "eeuu")
  country_id INTEGER NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  confidence TEXT NOT NULL DEFAULT 'high' CHECK (confidence IN ('high', 'medium', 'low')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE(alias_text)
);

CREATE INDEX IF NOT EXISTS idx_country_aliases_text ON public.country_text_aliases (alias_text);

COMMENT ON TABLE public.country_text_aliases IS 'Maps common text variations to country IDs for migration';

-- ============================================================================
-- STEP 5: Populate common aliases for countries
-- ============================================================================
INSERT INTO public.country_text_aliases (alias_text, country_id, confidence)
SELECT alias, c.id, conf::TEXT
FROM (VALUES
  -- Argentina
  ('argentina', 'AR', 'high'),
  ('arg', 'AR', 'high'),
  ('argentine', 'AR', 'high'),
  ('argentino', 'AR', 'high'),
  ('argentinian', 'AR', 'high'),
  ('buenos aires', 'AR', 'medium'),
  ('bs as', 'AR', 'low'),
  
  -- United States
  ('united states', 'US', 'high'),
  ('united states of america', 'US', 'high'),
  ('usa', 'US', 'high'),
  ('us', 'US', 'high'),
  ('eeuu', 'US', 'high'),
  ('estados unidos', 'US', 'high'),
  ('american', 'US', 'high'),
  ('america', 'US', 'medium'),
  
  -- United Kingdom
  ('united kingdom', 'GB', 'high'),
  ('uk', 'GB', 'high'),
  ('great britain', 'GB', 'high'),
  ('britain', 'GB', 'high'),
  ('british', 'GB', 'high'),
  ('england', 'GB', 'medium'),
  ('english', 'GB', 'medium'),
  ('scotland', 'GB', 'medium'),
  ('scottish', 'GB', 'medium'),
  ('wales', 'GB', 'medium'),
  ('welsh', 'GB', 'medium'),
  ('northern ireland', 'GB', 'medium'),
  
  -- Spain
  ('spain', 'ES', 'high'),
  ('españa', 'ES', 'high'),
  ('espana', 'ES', 'high'),
  ('spanish', 'ES', 'high'),
  ('español', 'ES', 'high'),
  ('espanol', 'ES', 'high'),
  
  -- Germany
  ('germany', 'DE', 'high'),
  ('deutschland', 'DE', 'high'),
  ('german', 'DE', 'high'),
  ('alemania', 'DE', 'high'),
  
  -- France
  ('france', 'FR', 'high'),
  ('french', 'FR', 'high'),
  ('francia', 'FR', 'high'),
  ('francés', 'FR', 'high'),
  ('frances', 'FR', 'high'),
  
  -- Italy
  ('italy', 'IT', 'high'),
  ('italia', 'IT', 'high'),
  ('italian', 'IT', 'high'),
  ('italiano', 'IT', 'high'),
  
  -- Brazil
  ('brazil', 'BR', 'high'),
  ('brasil', 'BR', 'high'),
  ('brazilian', 'BR', 'high'),
  ('brasileño', 'BR', 'high'),
  ('brasileno', 'BR', 'high'),
  
  -- Mexico
  ('mexico', 'MX', 'high'),
  ('méxico', 'MX', 'high'),
  ('mexican', 'MX', 'high'),
  ('mexicano', 'MX', 'high'),
  
  -- Colombia
  ('colombia', 'CO', 'high'),
  ('colombian', 'CO', 'high'),
  ('colombiano', 'CO', 'high'),
  
  -- Chile
  ('chile', 'CL', 'high'),
  ('chilean', 'CL', 'high'),
  ('chileno', 'CL', 'high'),
  
  -- Uruguay
  ('uruguay', 'UY', 'high'),
  ('uruguayan', 'UY', 'high'),
  ('uruguayo', 'UY', 'high'),
  
  -- Paraguay
  ('paraguay', 'PY', 'high'),
  ('paraguayan', 'PY', 'high'),
  ('paraguayo', 'PY', 'high'),
  
  -- Peru
  ('peru', 'PE', 'high'),
  ('perú', 'PE', 'high'),
  ('peruvian', 'PE', 'high'),
  ('peruano', 'PE', 'high'),
  
  -- Venezuela
  ('venezuela', 'VE', 'high'),
  ('venezuelan', 'VE', 'high'),
  ('venezolano', 'VE', 'high'),
  
  -- Ecuador
  ('ecuador', 'EC', 'high'),
  ('ecuadorian', 'EC', 'high'),
  ('ecuatoriano', 'EC', 'high'),
  
  -- Bolivia
  ('bolivia', 'BO', 'high'),
  ('bolivian', 'BO', 'high'),
  ('boliviano', 'BO', 'high'),
  
  -- Portugal
  ('portugal', 'PT', 'high'),
  ('portuguese', 'PT', 'high'),
  ('portugués', 'PT', 'high'),
  ('portugues', 'PT', 'high'),
  
  -- Netherlands
  ('netherlands', 'NL', 'high'),
  ('holland', 'NL', 'high'),
  ('dutch', 'NL', 'high'),
  ('holanda', 'NL', 'high'),
  ('holandés', 'NL', 'high'),
  ('holandes', 'NL', 'high'),
  
  -- Belgium
  ('belgium', 'BE', 'high'),
  ('belgian', 'BE', 'high'),
  ('bélgica', 'BE', 'high'),
  ('belgica', 'BE', 'high'),
  
  -- Switzerland
  ('switzerland', 'CH', 'high'),
  ('swiss', 'CH', 'high'),
  ('suiza', 'CH', 'high'),
  ('suisse', 'CH', 'high'),
  
  -- Austria
  ('austria', 'AT', 'high'),
  ('austrian', 'AT', 'high'),
  
  -- Poland
  ('poland', 'PL', 'high'),
  ('polish', 'PL', 'high'),
  ('polska', 'PL', 'high'),
  ('polonia', 'PL', 'high'),
  
  -- Turkey
  ('turkey', 'TR', 'high'),
  ('turkish', 'TR', 'high'),
  ('turquía', 'TR', 'high'),
  ('turquia', 'TR', 'high'),
  ('türkiye', 'TR', 'high'),
  
  -- Greece
  ('greece', 'GR', 'high'),
  ('greek', 'GR', 'high'),
  ('grecia', 'GR', 'high'),
  
  -- Croatia
  ('croatia', 'HR', 'high'),
  ('croatian', 'HR', 'high'),
  ('croacia', 'HR', 'high'),
  ('hrvatska', 'HR', 'high'),
  
  -- Serbia
  ('serbia', 'RS', 'high'),
  ('serbian', 'RS', 'high'),
  
  -- Russia
  ('russia', 'RU', 'high'),
  ('russian', 'RU', 'high'),
  ('rusia', 'RU', 'high'),
  
  -- Ukraine
  ('ukraine', 'UA', 'high'),
  ('ukrainian', 'UA', 'high'),
  ('ucrania', 'UA', 'high'),
  
  -- Japan
  ('japan', 'JP', 'high'),
  ('japanese', 'JP', 'high'),
  ('japón', 'JP', 'high'),
  ('japon', 'JP', 'high'),
  
  -- South Korea
  ('south korea', 'KR', 'high'),
  ('korea', 'KR', 'medium'),
  ('korean', 'KR', 'high'),
  ('corea', 'KR', 'medium'),
  ('corea del sur', 'KR', 'high'),
  
  -- China
  ('china', 'CN', 'high'),
  ('chinese', 'CN', 'high'),
  
  -- Australia
  ('australia', 'AU', 'high'),
  ('australian', 'AU', 'high'),
  ('aussie', 'AU', 'medium'),
  
  -- New Zealand
  ('new zealand', 'NZ', 'high'),
  ('nz', 'NZ', 'high'),
  ('kiwi', 'NZ', 'medium'),
  
  -- Canada
  ('canada', 'CA', 'high'),
  ('canadian', 'CA', 'high'),
  ('canadá', 'CA', 'high'),
  
  -- South Africa
  ('south africa', 'ZA', 'high'),
  ('south african', 'ZA', 'high'),
  ('sudáfrica', 'ZA', 'high'),
  ('sudafrica', 'ZA', 'high'),
  
  -- Nigeria
  ('nigeria', 'NG', 'high'),
  ('nigerian', 'NG', 'high'),
  
  -- Ghana
  ('ghana', 'GH', 'high'),
  ('ghanaian', 'GH', 'high'),
  
  -- Cameroon
  ('cameroon', 'CM', 'high'),
  ('cameroonian', 'CM', 'high'),
  ('camerún', 'CM', 'high'),
  ('camerun', 'CM', 'high'),
  
  -- Egypt
  ('egypt', 'EG', 'high'),
  ('egyptian', 'EG', 'high'),
  ('egipto', 'EG', 'high'),
  
  -- Morocco
  ('morocco', 'MA', 'high'),
  ('moroccan', 'MA', 'high'),
  ('marruecos', 'MA', 'high'),
  
  -- Algeria
  ('algeria', 'DZ', 'high'),
  ('algerian', 'DZ', 'high'),
  ('argelia', 'DZ', 'high'),
  
  -- Tunisia
  ('tunisia', 'TN', 'high'),
  ('tunisian', 'TN', 'high'),
  ('túnez', 'TN', 'high'),
  ('tunez', 'TN', 'high'),
  
  -- Senegal
  ('senegal', 'SN', 'high'),
  ('senegalese', 'SN', 'high'),
  
  -- Ivory Coast
  ('ivory coast', 'CI', 'high'),
  ('cote d''ivoire', 'CI', 'high'),
  ('côte d''ivoire', 'CI', 'high'),
  ('ivorian', 'CI', 'high'),
  ('costa de marfil', 'CI', 'high'),
  
  -- Ireland
  ('ireland', 'IE', 'high'),
  ('irish', 'IE', 'high'),
  ('irlanda', 'IE', 'high'),
  
  -- Sweden
  ('sweden', 'SE', 'high'),
  ('swedish', 'SE', 'high'),
  ('suecia', 'SE', 'high'),
  
  -- Norway
  ('norway', 'NO', 'high'),
  ('norwegian', 'NO', 'high'),
  ('noruega', 'NO', 'high'),
  
  -- Denmark
  ('denmark', 'DK', 'high'),
  ('danish', 'DK', 'high'),
  ('dinamarca', 'DK', 'high'),
  
  -- Finland
  ('finland', 'FI', 'high'),
  ('finnish', 'FI', 'high'),
  ('finlandia', 'FI', 'high'),
  
  -- Czech Republic
  ('czech republic', 'CZ', 'high'),
  ('czechia', 'CZ', 'high'),
  ('czech', 'CZ', 'high'),
  ('república checa', 'CZ', 'high'),
  ('republica checa', 'CZ', 'high'),
  
  -- Romania
  ('romania', 'RO', 'high'),
  ('romanian', 'RO', 'high'),
  ('rumania', 'RO', 'high'),
  ('rumanía', 'RO', 'high'),
  
  -- Hungary
  ('hungary', 'HU', 'high'),
  ('hungarian', 'HU', 'high'),
  ('hungría', 'HU', 'high'),
  ('hungria', 'HU', 'high'),
  
  -- India
  ('india', 'IN', 'high'),
  ('indian', 'IN', 'high'),
  
  -- Israel
  ('israel', 'IL', 'high'),
  ('israeli', 'IL', 'high'),
  
  -- Saudi Arabia
  ('saudi arabia', 'SA', 'high'),
  ('saudi', 'SA', 'high'),
  ('arabia saudita', 'SA', 'high'),
  
  -- UAE
  ('united arab emirates', 'AE', 'high'),
  ('uae', 'AE', 'high'),
  ('emirati', 'AE', 'high'),
  ('emiratos árabes unidos', 'AE', 'high'),
  ('emiratos arabes unidos', 'AE', 'high'),
  
  -- Qatar
  ('qatar', 'QA', 'high'),
  ('qatari', 'QA', 'high'),
  
  -- Jamaica
  ('jamaica', 'JM', 'high'),
  ('jamaican', 'JM', 'high'),
  
  -- Cuba
  ('cuba', 'CU', 'high'),
  ('cuban', 'CU', 'high'),
  ('cubano', 'CU', 'high'),
  
  -- Dominican Republic
  ('dominican republic', 'DO', 'high'),
  ('dominican', 'DO', 'high'),
  ('república dominicana', 'DO', 'high'),
  ('republica dominicana', 'DO', 'high'),
  ('dominicano', 'DO', 'high'),
  
  -- Costa Rica
  ('costa rica', 'CR', 'high'),
  ('costa rican', 'CR', 'high'),
  ('costarricense', 'CR', 'high'),
  
  -- Panama
  ('panama', 'PA', 'high'),
  ('panamá', 'PA', 'high'),
  ('panamanian', 'PA', 'high'),
  ('panameño', 'PA', 'high'),
  ('panameno', 'PA', 'high')
) AS aliases(alias, code, conf)
JOIN public.countries c ON c.code = aliases.code
ON CONFLICT (alias_text) DO NOTHING;

-- ============================================================================
-- STEP 6: Add new country ID columns to profiles
-- ============================================================================
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS nationality_country_id INTEGER REFERENCES public.countries(id),
  ADD COLUMN IF NOT EXISTS passport1_country_id INTEGER REFERENCES public.countries(id),
  ADD COLUMN IF NOT EXISTS passport2_country_id INTEGER REFERENCES public.countries(id),
  ADD COLUMN IF NOT EXISTS base_country_id INTEGER REFERENCES public.countries(id);

CREATE INDEX IF NOT EXISTS idx_profiles_nationality_country ON public.profiles (nationality_country_id);
CREATE INDEX IF NOT EXISTS idx_profiles_passport1_country ON public.profiles (passport1_country_id);
CREATE INDEX IF NOT EXISTS idx_profiles_passport2_country ON public.profiles (passport2_country_id);
CREATE INDEX IF NOT EXISTS idx_profiles_base_country ON public.profiles (base_country_id);

COMMENT ON COLUMN public.profiles.nationality_country_id IS 'Normalized country reference for nationality';
COMMENT ON COLUMN public.profiles.passport1_country_id IS 'Normalized country reference for primary passport';
COMMENT ON COLUMN public.profiles.passport2_country_id IS 'Normalized country reference for secondary passport';
COMMENT ON COLUMN public.profiles.base_country_id IS 'Normalized country reference for base location country';

-- ============================================================================
-- STEP 7: Create function to match text to country
-- ============================================================================
CREATE OR REPLACE FUNCTION public.match_text_to_country(input_text TEXT)
RETURNS TABLE (country_id INTEGER, confidence TEXT, match_type TEXT)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  normalized TEXT;
  found_country_id INTEGER;
  found_confidence TEXT;
BEGIN
  IF input_text IS NULL OR TRIM(input_text) = '' THEN
    RETURN;
  END IF;
  
  normalized := LOWER(TRIM(input_text));
  
  -- 1. Exact match on pre-mapped aliases
  SELECT a.country_id, a.confidence INTO found_country_id, found_confidence
  FROM public.country_text_aliases a
  WHERE a.alias_text = normalized
  LIMIT 1;
  
  IF found_country_id IS NOT NULL THEN
    country_id := found_country_id;
    confidence := found_confidence;
    match_type := 'alias';
    RETURN NEXT;
    RETURN;
  END IF;
  
  -- 2. Exact match on country name, common_name, or nationality_name
  SELECT c.id INTO found_country_id
  FROM public.countries c
  WHERE LOWER(c.name) = normalized 
     OR LOWER(c.common_name) = normalized
     OR LOWER(c.nationality_name) = normalized
     OR LOWER(c.code) = normalized
     OR LOWER(c.code_alpha3) = normalized
  LIMIT 1;
  
  IF found_country_id IS NOT NULL THEN
    country_id := found_country_id;
    confidence := 'high';
    match_type := 'exact';
    RETURN NEXT;
    RETURN;
  END IF;
  
  -- 3. Fuzzy match using trigram similarity
  SELECT c.id, 
         CASE 
           WHEN GREATEST(
             similarity(LOWER(c.name), normalized),
             similarity(LOWER(c.nationality_name), normalized)
           ) > 0.6 THEN 'medium'
           ELSE 'low'
         END INTO found_country_id, found_confidence
  FROM public.countries c
  WHERE similarity(LOWER(c.name), normalized) > 0.3
     OR similarity(LOWER(c.nationality_name), normalized) > 0.3
  ORDER BY GREATEST(
    similarity(LOWER(c.name), normalized),
    similarity(LOWER(c.nationality_name), normalized)
  ) DESC
  LIMIT 1;
  
  IF found_country_id IS NOT NULL THEN
    country_id := found_country_id;
    confidence := found_confidence;
    match_type := 'fuzzy';
    RETURN NEXT;
    RETURN;
  END IF;
  
  -- 4. No match found
  country_id := NULL;
  confidence := 'unmatched';
  match_type := 'none';
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.match_text_to_country IS 'Matches free-text country/nationality input to a country_id with confidence level';

-- ============================================================================
-- STEP 8: Run automated migration for existing profiles
-- ============================================================================

-- Migrate nationality field
UPDATE public.profiles p
SET nationality_country_id = matched.country_id
FROM (
  SELECT 
    p2.id AS profile_id,
    (public.match_text_to_country(p2.nationality)).country_id AS country_id,
    (public.match_text_to_country(p2.nationality)).confidence AS confidence
  FROM public.profiles p2
  WHERE p2.nationality IS NOT NULL
    AND TRIM(p2.nationality) <> ''
    AND p2.nationality_country_id IS NULL
) AS matched
WHERE p.id = matched.profile_id
  AND matched.country_id IS NOT NULL
  AND matched.confidence IN ('high', 'medium');

-- Migrate passport_1 field
UPDATE public.profiles p
SET passport1_country_id = matched.country_id
FROM (
  SELECT 
    p2.id AS profile_id,
    (public.match_text_to_country(p2.passport_1)).country_id AS country_id,
    (public.match_text_to_country(p2.passport_1)).confidence AS confidence
  FROM public.profiles p2
  WHERE p2.passport_1 IS NOT NULL
    AND TRIM(p2.passport_1) <> ''
    AND p2.passport1_country_id IS NULL
) AS matched
WHERE p.id = matched.profile_id
  AND matched.country_id IS NOT NULL
  AND matched.confidence IN ('high', 'medium');

-- Migrate passport_2 field
UPDATE public.profiles p
SET passport2_country_id = matched.country_id
FROM (
  SELECT 
    p2.id AS profile_id,
    (public.match_text_to_country(p2.passport_2)).country_id AS country_id,
    (public.match_text_to_country(p2.passport_2)).confidence AS confidence
  FROM public.profiles p2
  WHERE p2.passport_2 IS NOT NULL
    AND TRIM(p2.passport_2) <> ''
    AND p2.passport2_country_id IS NULL
) AS matched
WHERE p.id = matched.profile_id
  AND matched.country_id IS NOT NULL
  AND matched.confidence IN ('high', 'medium');

-- ============================================================================
-- STEP 9: Create view for profiles pending manual review
-- ============================================================================
CREATE OR REPLACE VIEW public.profiles_pending_country_review AS
SELECT 
  p.id,
  p.full_name,
  p.email,
  p.role,
  p.nationality AS nationality_text,
  p.nationality_country_id,
  nc.name AS nationality_country_name,
  p.passport_1 AS passport1_text,
  p.passport1_country_id,
  p1c.name AS passport1_country_name,
  p.passport_2 AS passport2_text,
  p.passport2_country_id,
  p2c.name AS passport2_country_name,
  CASE 
    WHEN p.nationality IS NOT NULL AND p.nationality_country_id IS NULL THEN TRUE
    ELSE FALSE
  END AS nationality_needs_review,
  CASE 
    WHEN p.passport_1 IS NOT NULL AND p.passport1_country_id IS NULL THEN TRUE
    ELSE FALSE
  END AS passport1_needs_review,
  CASE 
    WHEN p.passport_2 IS NOT NULL AND p.passport2_country_id IS NULL THEN TRUE
    ELSE FALSE
  END AS passport2_needs_review
FROM public.profiles p
LEFT JOIN public.countries nc ON nc.id = p.nationality_country_id
LEFT JOIN public.countries p1c ON p1c.id = p.passport1_country_id
LEFT JOIN public.countries p2c ON p2c.id = p.passport2_country_id
WHERE 
  (p.nationality IS NOT NULL AND TRIM(p.nationality) <> '' AND p.nationality_country_id IS NULL)
  OR (p.passport_1 IS NOT NULL AND TRIM(p.passport_1) <> '' AND p.passport1_country_id IS NULL)
  OR (p.passport_2 IS NOT NULL AND TRIM(p.passport_2) <> '' AND p.passport2_country_id IS NULL);

COMMENT ON VIEW public.profiles_pending_country_review IS 'Shows profiles with country fields that could not be automatically mapped';

-- ============================================================================
-- STEP 10: Create admin function to manually resolve country mappings
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_resolve_country_mapping(
  p_profile_id UUID,
  p_field TEXT,
  p_country_id INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow service_role
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: only service_role can resolve country mappings';
  END IF;

  IF p_field = 'nationality' THEN
    UPDATE public.profiles SET nationality_country_id = p_country_id WHERE id = p_profile_id;
  ELSIF p_field = 'passport1' THEN
    UPDATE public.profiles SET passport1_country_id = p_country_id WHERE id = p_profile_id;
  ELSIF p_field = 'passport2' THEN
    UPDATE public.profiles SET passport2_country_id = p_country_id WHERE id = p_profile_id;
  ELSIF p_field = 'base_country' THEN
    UPDATE public.profiles SET base_country_id = p_country_id WHERE id = p_profile_id;
  ELSE
    RAISE EXCEPTION 'Invalid field: %. Must be nationality, passport1, passport2, or base_country', p_field;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.admin_resolve_country_mapping IS 'Admin function to manually map a profile field to a country_id';

-- ============================================================================
-- STEP 11: Create helper view for migration stats
-- ============================================================================
CREATE OR REPLACE VIEW public.country_migration_stats AS
SELECT
  (SELECT COUNT(*) FROM public.profiles WHERE onboarding_completed = TRUE) AS total_completed_profiles,
  (SELECT COUNT(*) FROM public.profiles WHERE nationality IS NOT NULL AND TRIM(nationality) <> '') AS profiles_with_nationality_text,
  (SELECT COUNT(*) FROM public.profiles WHERE nationality_country_id IS NOT NULL) AS profiles_with_nationality_id,
  (SELECT COUNT(*) FROM public.profiles WHERE nationality IS NOT NULL AND TRIM(nationality) <> '' AND nationality_country_id IS NULL) AS nationality_pending_review,
  (SELECT COUNT(*) FROM public.profiles WHERE passport_1 IS NOT NULL AND TRIM(passport_1) <> '') AS profiles_with_passport1_text,
  (SELECT COUNT(*) FROM public.profiles WHERE passport1_country_id IS NOT NULL) AS profiles_with_passport1_id,
  (SELECT COUNT(*) FROM public.profiles WHERE passport_1 IS NOT NULL AND TRIM(passport_1) <> '' AND passport1_country_id IS NULL) AS passport1_pending_review,
  (SELECT COUNT(*) FROM public.profiles WHERE passport_2 IS NOT NULL AND TRIM(passport_2) <> '') AS profiles_with_passport2_text,
  (SELECT COUNT(*) FROM public.profiles WHERE passport2_country_id IS NOT NULL) AS profiles_with_passport2_id,
  (SELECT COUNT(*) FROM public.profiles WHERE passport_2 IS NOT NULL AND TRIM(passport_2) <> '' AND passport2_country_id IS NULL) AS passport2_pending_review;

COMMENT ON VIEW public.country_migration_stats IS 'Overview of country data migration progress';

-- ============================================================================
-- STEP 12: RLS policies for countries table (read-only for all authenticated)
-- ============================================================================
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Countries are viewable by everyone"
  ON public.countries
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- STEP 13: Grant permissions
-- ============================================================================
GRANT SELECT ON public.countries TO authenticated;
GRANT SELECT ON public.country_text_aliases TO authenticated;
GRANT SELECT ON public.profiles_pending_country_review TO service_role;
GRANT SELECT ON public.country_migration_stats TO service_role;
GRANT EXECUTE ON FUNCTION public.match_text_to_country TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_resolve_country_mapping TO service_role;

COMMIT;
