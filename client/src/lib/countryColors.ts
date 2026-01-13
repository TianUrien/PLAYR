/**
 * Country color mapping system for vacancy cards.
 * Each country has a unique, consistent color used throughout the app.
 * 
 * Colors are chosen to be:
 * - Clearly distinguishable between countries
 * - Clean and professional
 * - Not overpowering the card content
 */

export interface CountryColorConfig {
  bg: string       // Background color for the banner
  text: string     // Text color for contrast
}

/**
 * Country color mapping based on country names.
 * Add more countries as needed, maintaining consistency.
 */
const COUNTRY_COLOR_MAP: Record<string, CountryColorConfig> = {
  // Major hockey nations with distinctive colors
  'netherlands': { bg: '#FF6B00', text: '#FFFFFF' },     // Dutch orange
  'argentina': { bg: '#6CB4EE', text: '#FFFFFF' },       // Argentine light blue
  'italy': { bg: '#008C45', text: '#FFFFFF' },           // Italian green
  'australia': { bg: '#002B7F', text: '#FFFFFF' },       // Australian navy
  'germany': { bg: '#DD0000', text: '#FFFFFF' },         // German red (from flag)
  'spain': { bg: '#AA151B', text: '#FFFFFF' },           // Spanish red
  'belgium': { bg: '#FDD835', text: '#1A1A1A' },         // Belgian yellow
  'england': { bg: '#C8102E', text: '#FFFFFF' },         // English red
  'united kingdom': { bg: '#012169', text: '#FFFFFF' },  // UK blue
  'great britain': { bg: '#012169', text: '#FFFFFF' },   // GB blue
  'france': { bg: '#0055A4', text: '#FFFFFF' },          // French blue
  'india': { bg: '#FF9933', text: '#FFFFFF' },           // Indian saffron
  'pakistan': { bg: '#01411C', text: '#FFFFFF' },        // Pakistani green
  'new zealand': { bg: '#000000', text: '#FFFFFF' },     // All Blacks black
  'ireland': { bg: '#169B62', text: '#FFFFFF' },         // Irish green
  'south africa': { bg: '#007A4D', text: '#FFFFFF' },    // SA green
  'malaysia': { bg: '#010066', text: '#FFFFFF' },        // Malaysian blue
  'japan': { bg: '#BC002D', text: '#FFFFFF' },           // Japanese red
  'korea': { bg: '#0047A0', text: '#FFFFFF' },           // Korean blue
  'south korea': { bg: '#0047A0', text: '#FFFFFF' },     // Korean blue
  'china': { bg: '#DE2910', text: '#FFFFFF' },           // Chinese red
  'usa': { bg: '#3C3B6E', text: '#FFFFFF' },             // US navy blue
  'united states': { bg: '#3C3B6E', text: '#FFFFFF' },   // US navy blue
  'canada': { bg: '#FF0000', text: '#FFFFFF' },          // Canadian red
  'poland': { bg: '#DC143C', text: '#FFFFFF' },          // Polish crimson
  'czech republic': { bg: '#11457E', text: '#FFFFFF' },  // Czech blue
  'czechia': { bg: '#11457E', text: '#FFFFFF' },         // Czechia blue
  'austria': { bg: '#ED2939', text: '#FFFFFF' },         // Austrian red
  'switzerland': { bg: '#FF0000', text: '#FFFFFF' },     // Swiss red
  'portugal': { bg: '#006600', text: '#FFFFFF' },        // Portuguese green
  'brazil': { bg: '#009C3B', text: '#FFFFFF' },          // Brazilian green
  'chile': { bg: '#0033A0', text: '#FFFFFF' },           // Chilean blue
  'scotland': { bg: '#0065BD', text: '#FFFFFF' },        // Scottish blue
  'wales': { bg: '#D4003A', text: '#FFFFFF' },           // Welsh red
  'egypt': { bg: '#C8102E', text: '#FFFFFF' },           // Egyptian red
  'kenya': { bg: '#006600', text: '#FFFFFF' },           // Kenyan green
  'ghana': { bg: '#006B3F', text: '#FFFFFF' },           // Ghanaian green
  'nigeria': { bg: '#008751', text: '#FFFFFF' },         // Nigerian green
  'thailand': { bg: '#241D4F', text: '#FFFFFF' },        // Thai purple
  'indonesia': { bg: '#FF0000', text: '#FFFFFF' },       // Indonesian red
  'singapore': { bg: '#EF3340', text: '#FFFFFF' },       // Singaporean red
  'hong kong': { bg: '#DE2910', text: '#FFFFFF' },       // HK red
  'turkey': { bg: '#E30A17', text: '#FFFFFF' },          // Turkish red
  'greece': { bg: '#0D5EAF', text: '#FFFFFF' },          // Greek blue
  'sweden': { bg: '#006AA7', text: '#FFFFFF' },          // Swedish blue
  'norway': { bg: '#BA0C2F', text: '#FFFFFF' },          // Norwegian red
  'denmark': { bg: '#C8102E', text: '#FFFFFF' },         // Danish red
  'finland': { bg: '#003580', text: '#FFFFFF' },         // Finnish blue
  'russia': { bg: '#0039A6', text: '#FFFFFF' },          // Russian blue
  'ukraine': { bg: '#0057B7', text: '#FFFFFF' },         // Ukrainian blue
  'mexico': { bg: '#006847', text: '#FFFFFF' },          // Mexican green
  'colombia': { bg: '#FCD116', text: '#1A1A1A' },        // Colombian yellow
  'peru': { bg: '#D91023', text: '#FFFFFF' },            // Peruvian red
  'uruguay': { bg: '#5DA5DA', text: '#FFFFFF' },         // Uruguayan blue
  'paraguay': { bg: '#0038A8', text: '#FFFFFF' },        // Paraguayan blue
  'venezuela': { bg: '#FFCC00', text: '#1A1A1A' },       // Venezuelan yellow
  'qatar': { bg: '#8A1538', text: '#FFFFFF' },           // Qatari maroon
  'uae': { bg: '#00732F', text: '#FFFFFF' },             // UAE green
  'united arab emirates': { bg: '#00732F', text: '#FFFFFF' },
  'saudi arabia': { bg: '#006C35', text: '#FFFFFF' },    // Saudi green
  'israel': { bg: '#0038B8', text: '#FFFFFF' },          // Israeli blue
  'iran': { bg: '#239F40', text: '#FFFFFF' },            // Iranian green
  'vietnam': { bg: '#DA251D', text: '#FFFFFF' },         // Vietnamese red
  'philippines': { bg: '#0038A8', text: '#FFFFFF' },     // Philippine blue
  'taiwan': { bg: '#FE0000', text: '#FFFFFF' },          // Taiwan red
  'bangladesh': { bg: '#006A4E', text: '#FFFFFF' },      // Bangladesh green
  'sri lanka': { bg: '#8D153A', text: '#FFFFFF' },       // Sri Lanka maroon
  'nepal': { bg: '#DC143C', text: '#FFFFFF' },           // Nepal crimson
  'oman': { bg: '#008000', text: '#FFFFFF' },            // Omani green
  'kuwait': { bg: '#007A3D', text: '#FFFFFF' },          // Kuwaiti green
  'bahrain': { bg: '#CE1126', text: '#FFFFFF' },         // Bahraini red
  'jordan': { bg: '#007A33', text: '#FFFFFF' },          // Jordanian green
  'lebanon': { bg: '#ED1C24', text: '#FFFFFF' },         // Lebanese red
  'cyprus': { bg: '#D57800', text: '#FFFFFF' },          // Cypriot orange/copper
  'malta': { bg: '#CF142B', text: '#FFFFFF' },           // Maltese red
  'luxembourg': { bg: '#00A1DE', text: '#FFFFFF' },      // Luxembourgish blue
  'iceland': { bg: '#02529C', text: '#FFFFFF' },         // Icelandic blue
  'romania': { bg: '#002B7F', text: '#FFFFFF' },         // Romanian blue
  'bulgaria': { bg: '#00966E', text: '#FFFFFF' },        // Bulgarian green
  'croatia': { bg: '#171796', text: '#FFFFFF' },         // Croatian blue
  'serbia': { bg: '#C6363C', text: '#FFFFFF' },          // Serbian red
  'slovenia': { bg: '#005DA4', text: '#FFFFFF' },        // Slovenian blue
  'slovakia': { bg: '#0B4EA2', text: '#FFFFFF' },        // Slovak blue
  'hungary': { bg: '#477050', text: '#FFFFFF' },         // Hungarian green
  'lithuania': { bg: '#006A44', text: '#FFFFFF' },       // Lithuanian green
  'latvia': { bg: '#9E3039', text: '#FFFFFF' },          // Latvian maroon
  'estonia': { bg: '#4891D9', text: '#FFFFFF' },         // Estonian blue
  'belarus': { bg: '#C8313E', text: '#FFFFFF' },         // Belarusian red
  'azerbaijan': { bg: '#00B5E2', text: '#FFFFFF' },      // Azerbaijani blue
  'georgia': { bg: '#FF0000', text: '#FFFFFF' },         // Georgian red
  'armenia': { bg: '#FF9933', text: '#FFFFFF' },         // Armenian orange
  'kazakhstan': { bg: '#00AEC7', text: '#FFFFFF' },      // Kazakh turquoise
  'uzbekistan': { bg: '#1EB53A', text: '#FFFFFF' },      // Uzbek green
  'morocco': { bg: '#C1272D', text: '#FFFFFF' },         // Moroccan red
  'tunisia': { bg: '#E70013', text: '#FFFFFF' },         // Tunisian red
  'algeria': { bg: '#006233', text: '#FFFFFF' },         // Algerian green
  'zimbabwe': { bg: '#319208', text: '#FFFFFF' },        // Zimbabwean green
  'tanzania': { bg: '#00A0E8', text: '#FFFFFF' },        // Tanzanian blue
  'uganda': { bg: '#FCDC04', text: '#1A1A1A' },          // Ugandan yellow
  'mozambique': { bg: '#007168', text: '#FFFFFF' },      // Mozambican teal
  'namibia': { bg: '#003580', text: '#FFFFFF' },         // Namibian blue
  'botswana': { bg: '#75AADB', text: '#FFFFFF' },        // Botswana light blue
  'zambia': { bg: '#198A00', text: '#FFFFFF' },          // Zambian green
}

/**
 * Default color for countries not explicitly mapped.
 * Uses a neutral professional color.
 */
const DEFAULT_COLOR: CountryColorConfig = {
  bg: '#4B5563', // gray-600 - neutral professional gray
  text: '#FFFFFF'
}

/**
 * Get the color configuration for a country.
 * Matches are case-insensitive.
 * 
 * @param countryName - The name of the country
 * @returns The color configuration for the banner
 */
export function getCountryColor(countryName: string | null | undefined): CountryColorConfig {
  if (!countryName) return DEFAULT_COLOR
  
  const normalizedName = countryName.toLowerCase().trim()
  return COUNTRY_COLOR_MAP[normalizedName] ?? DEFAULT_COLOR
}

/**
 * Format the country name for display in the banner.
 * Returns uppercase for visual consistency.
 * 
 * @param countryName - The country name
 * @returns Uppercase formatted country name
 */
export function formatCountryBanner(countryName: string | null | undefined): string {
  if (!countryName) return ''
  return countryName.toUpperCase().trim()
}
