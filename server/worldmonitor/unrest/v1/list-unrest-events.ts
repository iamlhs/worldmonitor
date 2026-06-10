/**
 * ListUnrestEvents RPC -- reads seeded unrest data from Railway seed cache.
 * All external ACLED/GDELT API calls happen in seed-unrest.mjs on Railway.
 */

import type {
  ServerContext,
  ListUnrestEventsRequest,
  ListUnrestEventsResponse,
  UnrestEvent,
} from '../../../../src/generated/server/worldmonitor/unrest/v1/service_server';

import { sortBySeverityAndRecency } from './_shared';
import { getCachedJson } from '../../../_shared/redis';

const SEED_CACHE_KEY = 'unrest:events:v1';

function filterSeedEvents(
  events: UnrestEvent[],
  req: ListUnrestEventsRequest,
): UnrestEvent[] {
  let filtered = events;
  if (req.country) {
    const country = req.country.toLowerCase();
    filtered = filtered.filter(
      (e) => e.country.toLowerCase() === country || e.country.toLowerCase().includes(country),
    );
  }
  if (req.start > 0) {
    filtered = filtered.filter((e) => e.occurredAt >= req.start);
  }
  if (req.end > 0) {
    filtered = filtered.filter((e) => e.occurredAt <= req.end);
  }
  return filtered;
}

import fs from 'fs';
import path from 'path';

export async function listUnrestEvents(
  _ctx: ServerContext,
  req: ListUnrestEventsRequest,
): Promise<ListUnrestEventsResponse> {
  try {
    let seedData = await getCachedJson(SEED_CACHE_KEY, true) as ListUnrestEventsResponse | null;

    // Local fallback for development: if no seed cache is available, load from
    // public/edas_exports/events.json so developers can work without Redis.
    if (!seedData) {
      try {
        const root = path.resolve(process.cwd());
        const localPath = path.join(root, 'public', 'edas_exports', 'events.json');
        if (fs.existsSync(localPath)) {
          const raw = fs.readFileSync(localPath, 'utf8');
          const parsed = JSON.parse(raw) as Array<any>;
          // ---------------------------------------------------------------------------
          // EDAS city/place name lookup (expanded)
          const CITY_COORDS_LOOKUP: Record<string, { latitude: number; longitude: number }> = {
            // Hong Kong districts / places
            'hong kong': { latitude: 22.3193, longitude: 114.1694 },
            'kowloon': { latitude: 22.3183, longitude: 114.1694 },
            'mong kok': { latitude: 22.3193, longitude: 114.1700 },
            'yuen long': { latitude: 22.4440, longitude: 114.0306 },
            'sheung wan': { latitude: 22.2860, longitude: 114.1506 },
            'tsim sha tsui': { latitude: 22.2968, longitude: 114.1722 },
            'tai po': { latitude: 22.4446, longitude: 114.1696 },
            'tin shui wai': { latitude: 22.4470, longitude: 113.9970 },
            'tai wai': { latitude: 22.3830, longitude: 114.1880 },
            'wong tai sin': { latitude: 22.3370, longitude: 114.1920 },
            'central': { latitude: 22.2810, longitude: 114.1588 },
            'sai ying pun': { latitude: 22.2850, longitude: 114.1360 },
            'north point': { latitude: 22.2936, longitude: 114.2037 },
            'sha tin': { latitude: 22.3839, longitude: 114.1975 },
            'tuen mun': { latitude: 22.3964, longitude: 113.9736 },
            'tai koo': { latitude: 22.2835, longitude: 114.2150 },
            'cheung sha wan': { latitude: 22.3349, longitude: 114.1529 },
            'sham shui po': { latitude: 22.3305, longitude: 114.1604 },
            'tung chung': { latitude: 22.2880, longitude: 113.9419 },
            'prince edward': { latitude: 22.3230, longitude: 114.1690 },
            'prince edward station': { latitude: 22.3230, longitude: 114.1690 },
            'kowloon bay': { latitude: 22.3089, longitude: 114.2228 },
            'ngau tau kok': { latitude: 22.3098, longitude: 114.2261 },
            'kwun tong': { latitude: 22.3087, longitude: 114.2243 },
            'tai wo hau': { latitude: 22.3656, longitude: 114.1105 },
            'yuen long station': { latitude: 22.4440, longitude: 114.0306 },
            'central station': { latitude: 22.2810, longitude: 114.1588 },
            'sai ying pun mtr': { latitude: 22.2850, longitude: 114.1360 },
            'mtr': { latitude: 22.3193, longitude: 114.1694 },
            'police station': { latitude: 22.3193, longitude: 114.1694 },
            'hong kong protests': { latitude: 22.3193, longitude: 114.1694 },
            'kowloon tong': { latitude: 22.3340, longitude: 114.1910 },
            'tseung kwan o': { latitude: 22.3119, longitude: 114.2578 },
            'sai kung': { latitude: 22.3810, longitude: 114.2710 },
            'castle peak road': { latitude: 22.4360, longitude: 113.9790 },
            'nam pin wai': { latitude: 22.4440, longitude: 114.0306 },
            'admiralty': { latitude: 22.2797, longitude: 114.1626 },
            'causeway bay': { latitude: 22.2799, longitude: 114.1912 },
            'tin hau': { latitude: 22.2819, longitude: 114.1906 },
            'yau tei': { latitude: 22.3129, longitude: 114.1711 },
            'harcourt road': { latitude: 22.2788, longitude: 114.1643 },
            'new town plaza': { latitude: 22.3818, longitude: 114.1888 },
            // Iran cities / places (expanded)
            'iran': { latitude: 32.4279, longitude: 53.6880 },
            'tehran': { latitude: 35.6892, longitude: 51.3890 },
            'mashhad': { latitude: 36.2605, longitude: 59.6168 },
            'isfahan': { latitude: 32.6546, longitude: 51.6680 },
            'shiraz': { latitude: 29.5918, longitude: 52.5836 },
            'tabriz': { latitude: 38.0962, longitude: 46.2738 },
            'qom': { latitude: 34.6401, longitude: 50.8764 },
            'karaj': { latitude: 35.8400, longitude: 50.9391 },
            'ahvaz': { latitude: 31.3183, longitude: 48.6706 },
            'kermanshah': { latitude: 34.3142, longitude: 47.0650 },
            'rasht': { latitude: 37.2808, longitude: 49.5832 },
            'zahedan': { latitude: 29.4963, longitude: 60.8749 },
            'urmia': { latitude: 37.5519, longitude: 45.0760 },
            'bandar abbas': { latitude: 27.1833, longitude: 56.2666 },
            'yazd': { latitude: 31.8974, longitude: 54.3569 },
            'sanandaj': { latitude: 35.3098, longitude: 46.9980 },
            'arak': { latitude: 34.0917, longitude: 49.6892 },
            'ardabil': { latitude: 38.2498, longitude: 48.2933 },
            'sari': { latitude: 36.5620, longitude: 53.0601 },
            'hamedan': { latitude: 34.7986, longitude: 48.5146 },
            'khorramabad': { latitude: 33.4878, longitude: 48.3558 },
            'zanjan': { latitude: 36.6736, longitude: 48.4787 },
            'qazvin': { latitude: 36.2648, longitude: 50.0160 },
            'shahriar': { latitude: 35.6540, longitude: 51.0279 },
            'shush': { latitude: 32.1942, longitude: 48.2560 },
            'bushehr': { latitude: 28.9689, longitude: 50.8386 },
            'kish': { latitude: 26.5348, longitude: 53.9794 },
            'gorgan': { latitude: 36.8412, longitude: 54.4378 },
            'birjand': { latitude: 32.8745, longitude: 59.2211 },
            'bojnord': { latitude: 37.4775, longitude: 57.3278 },
            'ilam': { latitude: 33.6378, longitude: 46.4232 },
            'yasuj': { latitude: 30.6681, longitude: 51.5876 },
            'semnan': { latitude: 35.5755, longitude: 53.3867 },
            'dezful': { latitude: 32.3822, longitude: 48.4035 },
            'shahr-e kord': { latitude: 32.3256, longitude: 50.8599 },
            'kashan': { latitude: 33.9850, longitude: 51.4097 },
            'saveh': { latitude: 35.0239, longitude: 50.3567 },
            'neishabur': { latitude: 36.2097, longitude: 58.7952 },
            'khomeyn': { latitude: 33.6432, longitude: 50.0818 },
            'malayer': { latitude: 34.2969, longitude: 48.8235 },
            'maragheh': { latitude: 37.3890, longitude: 46.2397 },
            'ramsar': { latitude: 36.9204, longitude: 50.6467 },
            'babolsar': { latitude: 36.7028, longitude: 52.6578 },
            'amol': { latitude: 36.4697, longitude: 52.3509 },
          };

          const hkCentroid = { latitude: 22.3193, longitude: 114.1694 };
          const iranCentroid = { latitude: 32.4279, longitude: 53.6880 };

          /** Deterministic pseudo-random offset based on event id */
          function locationJitter(seed: string, range = 0.8): { latitude: number; longitude: number } {
            let hash = 0;
            for (let i = 0; i < seed.length; i++) {
              const ch = seed.charCodeAt(i);
              hash = ((hash << 5) - hash) + ch;
              hash |= 0;
            }
            const latOff = ((Math.abs(hash) % 1000) / 1000) * range - range / 2;
            const lonOff = ((Math.abs(hash * 37) % 1000) / 1000) * range - range / 2;
            return { latitude: latOff, longitude: lonOff };
          }

          /** Extract city/place name from summary text */
          function extractCityFromSummary(summary: string, country: string): string | undefined {
            if (!summary) return undefined;
            const lower = summary.toLowerCase();
            // Iran city keywords in priority order
            const iranCityPatterns: Array<{ name: string; keywords: string[] }> = [
              { name: 'tehran', keywords: ['tehran', 'shahriar'] },
              { name: 'isfahan', keywords: ['isfahan'] },
              { name: 'mashhad', keywords: ['mashhad'] },
              { name: 'shiraz', keywords: ['shiraz'] },
              { name: 'tabriz', keywords: ['tabriz'] },
              { name: 'zahedan', keywords: ['zahedan'] },
              { name: 'shush', keywords: ['shush'] },
              { name: 'ahvaz', keywords: ['ahvaz'] },
              { name: 'kermanshah', keywords: ['kermanshah'] },
              { name: 'rasht', keywords: ['rasht'] },
              { name: 'karaj', keywords: ['karaj'] },
              { name: 'qom', keywords: ['qom'] },
              { name: 'urmia', keywords: ['urmia'] },
              { name: 'bandar abbas', keywords: ['bandar abbas'] },
              { name: 'yazd', keywords: ['yazd'] },
            ];
            if (country === 'Iran') {
              for (const pat of iranCityPatterns) {
                if (pat.keywords.some(k => lower.includes(k))) return pat.name;
              }
            }
            // Hong Kong district keywords
            const hkCityPatterns: Array<{ name: string; keywords: string[] }> = [
              { name: 'yuen long', keywords: ['yuen long'] },
              { name: 'mong kok', keywords: ['mong kok'] },
              { name: 'kowloon', keywords: ['kowloon bay', 'kowloon'] },
              { name: 'sheung wan', keywords: ['sheung wan'] },
              { name: 'tuen mun', keywords: ['tuen mun'] },
              { name: 'tsim sha tsui', keywords: ['tsim sha tsui', 'tsim sha tsui'] },
              { name: 'tai po', keywords: ['tai po'] },
              { name: 'sha tin', keywords: ['sha tin'] },
              { name: 'tin shui wai', keywords: ['tin shui wai'] },
              { name: 'prince edward', keywords: ['prince edward'] },
              { name: 'wong tai sin', keywords: ['wong tai sin'] },
              { name: 'tung chung', keywords: ['tung chung'] },
              { name: 'central', keywords: ['central'] },
              { name: 'north point', keywords: ['north point'] },
              { name: 'causeway bay', keywords: ['causeway bay'] },
              { name: 'admiralty', keywords: ['admiralty'] },
            ];
            if (country === 'Hong Kong') {
              for (const pat of hkCityPatterns) {
                if (pat.keywords.some(k => lower.includes(k))) return pat.name;
              }
            }
            return undefined;
          }

          /**
           * Classify event type from summary text using keyword heuristics.
           * Returns [eventType, targetLayer, categoryTag].
           *
           * eventType: PROTEST, RIOT, STRIKE, DEMONSTRATION, CIVIL_UNREST
           * targetLayer: which map layer this event should render on
           * categoryTag: semantic category stored in tags for client routing
           */
          function classifyEvent(summary: string, tags: string[], region: string): [string, string, string] {
            // Return values are used as UnrestEvent.eventType which is a union of string literals
            const lower = (summary || '').toLowerCase();
            const allText = lower + ' ' + (Array.isArray(tags) ? tags.join(' ') : '');

            // ── Layer detection ──────────────────────────────────────────
            // Natural / disaster events
            if (/\b(earthquake|volcano|tsunami|flood|hurricane|typhoon|cyclone|wildfire|landslide|eruption)\b/i.test(allText)) {
              return ['UNREST_EVENT_TYPE_CIVIL_UNREST', 'natural', '_category:natural__layer:natural'];
            }
            // Disease outbreaks
            if (/\b(outbreak|epidemic|pandemic|covid|quarantine)\b/i.test(allText)) {
              return ['UNREST_EVENT_TYPE_CIVIL_UNREST', 'protests', '_category:health__layer:diseaseOutbreaks'];
            }
            // Accidents / crashes (plane crash etc.)
            if (/\b(crash|crashed|plane crash|accident)\b/i.test(allText)) {
              return ['UNREST_EVENT_TYPE_CIVIL_UNREST', 'protests', '_category:accident__layer:protests'];
            }
            // Military / conflict
            if (/\b(military|missile|strike|bomb|attack|troop|irgc|ballistic|weapon|satellite|launched)\b/i.test(allText)) {
              return ['UNREST_EVENT_TYPE_CIVIL_UNREST', 'protests', '_category:military__layer:conflicts'];
            }
            // Cyber
            if (/\b(cyber|hack|breach|malware|ransomware|ddos)\b/i.test(allText)) {
              return ['UNREST_EVENT_TYPE_CIVIL_UNREST', 'protests', '_category:cyber__layer:cyberThreats'];
            }

            // ── Event type (within protests layer) ──────────────────────
            // Riot: clashes, tear gas, violence, confrontation
            if (/\b(riot|clash|tear gas|violence|confront|violent|stone|petrol bomb|barricade)\b/i.test(allText)) {
              return ['UNREST_EVENT_TYPE_RIOT', 'protests', '_category:riot__layer:protests'];
            }
            // Strike: walkout, strike,罢工
            if (/\b(strike|walkout|罢工|boycott)\b/i.test(allText)) {
              return ['UNREST_EVENT_TYPE_STRIKE', 'protests', '_category:strike__layer:protests'];
            }
            // Demonstration: march, rally, gather, demonstration
            if (/\b(march|rally|demonstration|gather|sit-in|assembly|human chain|candlelight)\b/i.test(allText)) {
              return ['UNREST_EVENT_TYPE_DEMONSTRATION', 'protests', '_category:demonstration__layer:protests'];
            }
            // Protest: protest, unrest, uprising
            if (/\b(protest|unrest|uprising|抗议|demonstrat)\b/i.test(allText)) {
              return ['UNREST_EVENT_TYPE_PROTEST', 'protests', '_category:protest__layer:protests'];
            }

            // Default
            return ['UNREST_EVENT_TYPE_PROTEST', 'protests', '_category:protest__layer:protests'];
          }

          const events = parsed.map((e: any) => {
            const occurredAt = e.date_dir ? new Date(e.date_dir).getTime() : Date.now();
            // Use all segment keys as tags (not just first 8) for better matching
            const tags = e.segments ? Object.keys(e.segments) : [];
            const summary = e.summary || '';
            let countryGuess = '';
            if (Array.isArray(tags) && tags.find((t: string) => /hong kong|china|hongkong/i.test(t))) countryGuess = 'Hong Kong';
            else if (Array.isArray(tags) && tags.find((t: string) => /iran|tehran|mashhad|isfahan|tabriz|shiraz|qom|karaj|ahvaz|kermanshah|rasht|zahedan/i.test(t))) countryGuess = 'Iran';
            // Fallback: check region field
            if (!countryGuess) {
              if (/hongkong/i.test(e.region || '')) countryGuess = 'Hong Kong';
              else if (/iran/i.test(e.region || '')) countryGuess = 'Iran';
            }

            // Classify event type and target layer from summary content
            const [rawEventType, targetLayer, categoryTag] = classifyEvent(summary, tags, e.region || '');
            const eventType = rawEventType as unknown as UnrestEvent['eventType'];

          // Determine city and location for each event
            const detectedCity = extractCityFromSummary(summary, countryGuess);
            const city = detectedCity || '';

            // 1) Try exact tag match first
            let location: { latitude: number; longitude: number } | undefined;
            let citySource: 'tag' | 'summary' | 'country' | 'none' = 'none';
            if (Array.isArray(tags)) {
              const lowered = tags.map((t: string) => String(t).toLowerCase());
              for (const t of lowered) {
                if (CITY_COORDS_LOOKUP[t]) {
                  location = CITY_COORDS_LOOKUP[t];
                  citySource = 'tag';
                  break;
                }
              }
              // 2) Check if any tag CONTAINS a known city name
              if (!location) {
                for (const t of lowered) {
                  for (const [cityName, coords] of Object.entries(CITY_COORDS_LOOKUP)) {
                    if (t.includes(cityName) || cityName.includes(t)) {
                      location = coords;
                      citySource = 'tag';
                      break;
                    }
                  }
                  if (location) break;
                }
              }
              // 3) Country-level fallback via tag patterns
              if (!location) {
                if (lowered.some((t: string) => t.includes('hong kong') || t.includes('hongkong'))) {
                  location = { ...hkCentroid };
                  citySource = 'country';
                } else if (lowered.some((t: string) => ['iran','tehran','isfahan','mashhad'].some(k => t.includes(k)))) {
                  location = { ...iranCentroid };
                  citySource = 'country';
                }
              }
            }

            // 4) If we have a detected city from summary, use its precise coords
            if (city && CITY_COORDS_LOOKUP[city]) {
              location = CITY_COORDS_LOOKUP[city];
              citySource = 'summary';
            }

            // 5) Add deterministic jitter so events don't all stack at one point
            if (location && citySource === 'country') {
              const jitter = locationJitter(e.id || String(Math.random()), 0.6);
              location = {
                latitude: location.latitude + jitter.latitude,
                longitude: location.longitude + jitter.longitude,
              };
            }

            // Append layer/category tag for client-side routing
            const enrichedTags = [...tags, categoryTag];

            // If target layer is NOT protests, still keep in protests layer data for now
            // but mark with __layer tag so client can route it.
            // The layer tag allows the frontend to filter and route to the correct map layer.

            const evt: UnrestEvent = {
              id: `edas:${e.id}`,
              title: e.title || '',
              summary: e.summary || '',
              eventType,
              city,
              country: countryGuess,
              region: e.region || '',
              location: location || undefined,
              occurredAt,
              severity: e.bursty ? 'SEVERITY_LEVEL_MEDIUM' : 'SEVERITY_LEVEL_LOW',
              fatalities: 0,
              sources: ['edas'],
              sourceType: 'UNREST_SOURCE_TYPE_UNSPECIFIED',
              tags: enrichedTags,
              actors: [],
              confidence: e.bursty ? 'CONFIDENCE_LEVEL_MEDIUM' : 'CONFIDENCE_LEVEL_LOW',
              sourceUrls: e.source_file ? [e.source_file] : [],
            };
            return evt;
          });
          seedData = { events, clusters: [], pagination: undefined } as unknown as ListUnrestEventsResponse;
        }
      } catch (err) {
        // swallow local read errors and continue to return empty set below
      }
    }

    const filtered = filterSeedEvents(seedData?.events || [], req);
    const sorted = sortBySeverityAndRecency(filtered);
    return { events: sorted, clusters: [], pagination: undefined };
  } catch {
    return { events: [], clusters: [], pagination: undefined };
  }
}
