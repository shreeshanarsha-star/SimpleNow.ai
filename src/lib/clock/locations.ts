// Curated "My World" dataset for the Global Clock dashboard. Deliberately
// hand-picked rather than resolved live: these are the fixed default cards
// the spec calls out by name, so they load instantly with no network
// round-trip, and their timezones/coordinates are known-correct rather than
// dependent on a geocoder guessing the right same-named place. Arbitrary
// searches (anything not in this list) go through the live Open-Meteo
// geocoder in geocode.ts instead.

export interface CityRef {
  name: string;
  timezone: string;
  lat: number;
  lon: number;
}

export interface WorldLocation {
  id: string;
  flag: string;
  country: string;
  /** ISO 3166-1 alpha-2, used only for the search/compare labels. */
  countryCode: string;
  /** The single commercially-useful primary timezone/city shown on the compact card. */
  primaryCity: CityRef;
  /**
   * Other major timezones/cities within the same country worth surfacing on
   * expand -- populated for countries that genuinely span multiple zones
   * (USA, Australia, Indonesia). Empty for single-timezone countries.
   */
  otherZones: CityRef[];
  /** Top cities shown in the search-result "location intelligence" panel. */
  topCities: CityRef[];
}

export const WORLD_LOCATIONS: WorldLocation[] = [
  {
    id: "in",
    flag: "🇮🇳",
    country: "India",
    countryCode: "IN",
    primaryCity: { name: "New Delhi", timezone: "Asia/Kolkata", lat: 28.6139, lon: 77.209 },
    otherZones: [],
    topCities: [
      { name: "New Delhi", timezone: "Asia/Kolkata", lat: 28.6139, lon: 77.209 },
      { name: "Mumbai", timezone: "Asia/Kolkata", lat: 19.076, lon: 72.8777 },
      { name: "Bengaluru", timezone: "Asia/Kolkata", lat: 12.9716, lon: 77.5946 },
      { name: "Kolkata", timezone: "Asia/Kolkata", lat: 22.5726, lon: 88.3639 },
    ],
  },
  {
    id: "us",
    flag: "🇺🇸",
    country: "USA",
    countryCode: "US",
    primaryCity: { name: "New York", timezone: "America/New_York", lat: 40.7128, lon: -74.006 },
    otherZones: [
      { name: "Chicago", timezone: "America/Chicago", lat: 41.8781, lon: -87.6298 },
      { name: "Denver", timezone: "America/Denver", lat: 39.7392, lon: -104.9903 },
      { name: "Los Angeles", timezone: "America/Los_Angeles", lat: 34.0522, lon: -118.2437 },
    ],
    topCities: [
      { name: "New York", timezone: "America/New_York", lat: 40.7128, lon: -74.006 },
      { name: "Los Angeles", timezone: "America/Los_Angeles", lat: 34.0522, lon: -118.2437 },
      { name: "Chicago", timezone: "America/Chicago", lat: 41.8781, lon: -87.6298 },
      { name: "Denver", timezone: "America/Denver", lat: 39.7392, lon: -104.9903 },
    ],
  },
  {
    id: "mx",
    flag: "🇲🇽",
    country: "Mexico",
    countryCode: "MX",
    primaryCity: { name: "Mexico City", timezone: "America/Mexico_City", lat: 19.4326, lon: -99.1332 },
    otherZones: [],
    topCities: [
      { name: "Mexico City", timezone: "America/Mexico_City", lat: 19.4326, lon: -99.1332 },
      { name: "Guadalajara", timezone: "America/Mexico_City", lat: 20.6597, lon: -103.3496 },
      { name: "Monterrey", timezone: "America/Monterrey", lat: 25.6866, lon: -100.3161 },
      { name: "Puebla", timezone: "America/Mexico_City", lat: 19.0414, lon: -98.2063 },
    ],
  },
  {
    id: "de",
    flag: "🇩🇪",
    country: "Germany",
    countryCode: "DE",
    primaryCity: { name: "Berlin", timezone: "Europe/Berlin", lat: 52.52, lon: 13.405 },
    otherZones: [],
    topCities: [
      { name: "Berlin", timezone: "Europe/Berlin", lat: 52.52, lon: 13.405 },
      { name: "Munich", timezone: "Europe/Berlin", lat: 48.1351, lon: 11.582 },
      { name: "Hamburg", timezone: "Europe/Berlin", lat: 53.5511, lon: 9.9937 },
      { name: "Frankfurt", timezone: "Europe/Berlin", lat: 50.1109, lon: 8.6821 },
    ],
  },
  {
    id: "pl",
    flag: "🇵🇱",
    country: "Poland",
    countryCode: "PL",
    primaryCity: { name: "Warsaw", timezone: "Europe/Warsaw", lat: 52.2297, lon: 21.0122 },
    otherZones: [],
    topCities: [
      { name: "Warsaw", timezone: "Europe/Warsaw", lat: 52.2297, lon: 21.0122 },
      { name: "Krakow", timezone: "Europe/Warsaw", lat: 50.0647, lon: 19.945 },
      { name: "Lodz", timezone: "Europe/Warsaw", lat: 51.7592, lon: 19.456 },
      { name: "Wroclaw", timezone: "Europe/Warsaw", lat: 51.1079, lon: 17.0385 },
    ],
  },
  {
    id: "es",
    flag: "🇪🇸",
    country: "Spain",
    countryCode: "ES",
    primaryCity: { name: "Madrid", timezone: "Europe/Madrid", lat: 40.4168, lon: -3.7038 },
    otherZones: [],
    topCities: [
      { name: "Madrid", timezone: "Europe/Madrid", lat: 40.4168, lon: -3.7038 },
      { name: "Barcelona", timezone: "Europe/Madrid", lat: 41.3874, lon: 2.1686 },
      { name: "Valencia", timezone: "Europe/Madrid", lat: 39.4699, lon: -0.3763 },
      { name: "Seville", timezone: "Europe/Madrid", lat: 37.3891, lon: -5.9845 },
    ],
  },
  {
    id: "sg",
    flag: "🇸🇬",
    country: "Singapore",
    countryCode: "SG",
    primaryCity: { name: "Singapore", timezone: "Asia/Singapore", lat: 1.3521, lon: 103.8198 },
    otherZones: [],
    topCities: [{ name: "Singapore", timezone: "Asia/Singapore", lat: 1.3521, lon: 103.8198 }],
  },
  {
    id: "id",
    flag: "🇮🇩",
    country: "Indonesia",
    countryCode: "ID",
    primaryCity: { name: "Jakarta", timezone: "Asia/Jakarta", lat: -6.2088, lon: 106.8456 },
    otherZones: [
      { name: "Denpasar (Bali)", timezone: "Asia/Makassar", lat: -8.6705, lon: 115.2126 },
      { name: "Makassar", timezone: "Asia/Makassar", lat: -5.1477, lon: 119.4327 },
      { name: "Jayapura", timezone: "Asia/Jayapura", lat: -2.5337, lon: 140.7181 },
    ],
    topCities: [
      { name: "Jakarta", timezone: "Asia/Jakarta", lat: -6.2088, lon: 106.8456 },
      { name: "Surabaya", timezone: "Asia/Jakarta", lat: -7.2575, lon: 112.7521 },
      { name: "Denpasar (Bali)", timezone: "Asia/Makassar", lat: -8.6705, lon: 115.2126 },
      { name: "Makassar", timezone: "Asia/Makassar", lat: -5.1477, lon: 119.4327 },
    ],
  },
  {
    id: "th",
    flag: "🇹🇭",
    country: "Thailand",
    countryCode: "TH",
    primaryCity: { name: "Bangkok", timezone: "Asia/Bangkok", lat: 13.7563, lon: 100.5018 },
    otherZones: [],
    topCities: [
      { name: "Bangkok", timezone: "Asia/Bangkok", lat: 13.7563, lon: 100.5018 },
      { name: "Chiang Mai", timezone: "Asia/Bangkok", lat: 18.7883, lon: 98.9853 },
      { name: "Phuket", timezone: "Asia/Bangkok", lat: 7.8804, lon: 98.3923 },
      { name: "Pattaya", timezone: "Asia/Bangkok", lat: 12.9236, lon: 100.8825 },
    ],
  },
  {
    id: "au",
    flag: "🇦🇺",
    country: "Australia",
    countryCode: "AU",
    primaryCity: { name: "Sydney", timezone: "Australia/Sydney", lat: -33.8688, lon: 151.2093 },
    otherZones: [
      { name: "Perth", timezone: "Australia/Perth", lat: -31.9505, lon: 115.8605 },
      { name: "Adelaide", timezone: "Australia/Adelaide", lat: -34.9285, lon: 138.6007 },
      { name: "Brisbane", timezone: "Australia/Brisbane", lat: -27.4698, lon: 153.0251 },
    ],
    topCities: [
      { name: "Sydney", timezone: "Australia/Sydney", lat: -33.8688, lon: 151.2093 },
      { name: "Melbourne", timezone: "Australia/Melbourne", lat: -37.8136, lon: 144.9631 },
      { name: "Brisbane", timezone: "Australia/Brisbane", lat: -27.4698, lon: 153.0251 },
      { name: "Perth", timezone: "Australia/Perth", lat: -31.9505, lon: 115.8605 },
    ],
  },
  {
    id: "gb",
    flag: "🇬🇧",
    country: "UK",
    countryCode: "GB",
    primaryCity: { name: "London", timezone: "Europe/London", lat: 51.5074, lon: -0.1278 },
    otherZones: [],
    topCities: [
      { name: "London", timezone: "Europe/London", lat: 51.5074, lon: -0.1278 },
      { name: "Manchester", timezone: "Europe/London", lat: 53.4808, lon: -2.2426 },
      { name: "Birmingham", timezone: "Europe/London", lat: 52.4862, lon: -1.8904 },
      { name: "Edinburgh", timezone: "Europe/London", lat: 55.9533, lon: -3.1883 },
    ],
  },
  {
    id: "br",
    flag: "🇧🇷",
    country: "Brazil",
    countryCode: "BR",
    primaryCity: { name: "São Paulo", timezone: "America/Sao_Paulo", lat: -23.5505, lon: -46.6333 },
    otherZones: [{ name: "Manaus", timezone: "America/Manaus", lat: -3.119, lon: -60.0217 }],
    topCities: [
      { name: "São Paulo", timezone: "America/Sao_Paulo", lat: -23.5505, lon: -46.6333 },
      { name: "Rio de Janeiro", timezone: "America/Sao_Paulo", lat: -22.9068, lon: -43.1729 },
      { name: "Brasília", timezone: "America/Sao_Paulo", lat: -15.7939, lon: -47.8828 },
      { name: "Salvador", timezone: "America/Sao_Paulo", lat: -12.9777, lon: -38.5016 },
    ],
  },
  {
    id: "eu-west",
    flag: "🌍",
    country: "Western Europe",
    countryCode: "EU",
    primaryCity: { name: "Paris", timezone: "Europe/Paris", lat: 48.8566, lon: 2.3522 },
    otherZones: [],
    topCities: [
      { name: "Paris", timezone: "Europe/Paris", lat: 48.8566, lon: 2.3522 },
      { name: "Amsterdam", timezone: "Europe/Amsterdam", lat: 52.3676, lon: 4.9041 },
      { name: "Brussels", timezone: "Europe/Brussels", lat: 50.8503, lon: 4.3517 },
      { name: "Rome", timezone: "Europe/Rome", lat: 41.9028, lon: 12.4964 },
    ],
  },
];

export function findLocationById(id: string): WorldLocation | undefined {
  return WORLD_LOCATIONS.find((l) => l.id === id);
}
