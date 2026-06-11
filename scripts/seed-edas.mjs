/*
Seed script: read public/edas_exports/events.json, transform to UnrestEvent[]
with city-level geocoding, and write to Redis key 'unrest:events:v1' using
Upstash REST API if configured.
Run locally: node scripts/seed-edas.mjs
*/
import fs from 'fs';
import path from 'path';

const root = path.resolve(process.cwd());
const edasDir = path.join(root, 'public', 'edas_exports');
const eventsPath = path.join(edasDir, 'events.json');

// ---- City coordinate lookup (mirrors server handler) ----
const CITY_COORDS = {
  // Hong Kong
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
  'sham shui po': { latitude: 22.3305, longitude: 114.1604 },
  'tung chung': { latitude: 22.2880, longitude: 113.9419 },
  'prince edward': { latitude: 22.3230, longitude: 114.1690 },
  'kowloon bay': { latitude: 22.3089, longitude: 114.2228 },
  'kwun tong': { latitude: 22.3087, longitude: 114.2243 },
  'causeway bay': { latitude: 22.2799, longitude: 114.1912 },
  'admiralty': { latitude: 22.2797, longitude: 114.1626 },
  // Iran
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
  'arak': { latitude: 34.0917, longitude: 49.6892 },
  'hamedan': { latitude: 34.7986, longitude: 48.5146 },
  'zanjan': { latitude: 36.6736, longitude: 48.4787 },
  'qazvin': { latitude: 36.2648, longitude: 50.0160 },
  'shahriar': { latitude: 35.6540, longitude: 51.0279 },
  'bushehr': { latitude: 28.9689, longitude: 50.8386 },
  'gorgan': { latitude: 36.8412, longitude: 54.4378 },
  'semnan': { latitude: 35.5755, longitude: 53.3867 },
};

const hkCentroid = { latitude: 22.3193, longitude: 114.1694 };
const iranCentroid = { latitude: 32.4279, longitude: 53.6880 };

/** Deterministic pseudo-random offset based on event id */
function locationJitter(seed, range = 0.8) {
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

/** Extract city/place name from summary text AND tags */
function extractCityFromSummary(summary, country, tags) {
  const searchText = ((summary || '') + ' ' + (Array.isArray(tags) ? tags.join(' ') : '')).toLowerCase();
  const patterns = country === 'Iran'
    ? [
        ['tehran', ['tehran', 'shahriar']],
        ['isfahan', ['isfahan']],
        ['mashhad', ['mashhad']],
        ['shiraz', ['shiraz']],
        ['tabriz', ['tabriz']],
        ['zahedan', ['zahedan']],
        ['ahvaz', ['ahvaz']],
        ['kermanshah', ['kermanshah']],
        ['rasht', ['rasht']],
        ['karaj', ['karaj']],
        ['qom', ['qom']],
        ['urmia', ['urmia']],
        ['bandar abbas', ['bandar abbas']],
        ['yazd', ['yazd']],
        ['bushehr', ['bushehr']],
      ]
    : country === 'Hong Kong'
    ? [
        ['yuen long', ['yuen long']],
        ['mong kok', ['mong kok']],
        ['kowloon', ['kowloon bay', 'kowloon']],
        ['sheung wan', ['sheung wan']],
        ['tuen mun', ['tuen mun']],
        ['tsim sha tsui', ['tsim sha tsui']],
        ['tai po', ['tai po']],
        ['sha tin', ['sha tin']],
        ['tin shui wai', ['tin shui wai']],
        ['prince edward', ['prince edward']],
        ['wong tai sin', ['wong tai sin']],
        ['tung chung', ['tung chung']],
        ['central', ['central']],
        ['north point', ['north point']],
        ['causeway bay', ['causeway bay']],
        ['admiralty', ['admiralty']],
      ]
    : [];
  for (const [name, keywords] of patterns) {
    if (keywords.some(k => searchText.includes(k))) return name;
  }
  return null;
}

function inferLocation(tags, summary, countryGuess) {
  // 1) Exact tag match
  const lowered = tags.map(t => String(t).toLowerCase());
  for (const t of lowered) {
    if (CITY_COORDS[t]) return { location: CITY_COORDS[t], source: 'tag' };
  }
  // 2) Tag contains city name
  for (const t of lowered) {
    for (const [cityName, coords] of Object.entries(CITY_COORDS)) {
      if (t.includes(cityName) || cityName.includes(t)) {
        return { location: coords, source: 'tag' };
      }
    }
  }
  // 3) Country centroid fallback
  if (lowered.some(t => /hong kong|hongkong/i.test(t))) {
    return { location: { ...hkCentroid }, source: 'country' };
  }
  if (lowered.some(t => /iran|tehran|isfahan|mashhad/i.test(t))) {
    return { location: { ...iranCentroid }, source: 'country' };
  }
  // 4) Summary-based city extraction
  const city = extractCityFromSummary(summary, countryGuess);
  if (city && CITY_COORDS[city]) {
    return { location: CITY_COORDS[city], source: 'summary' };
  }
  return null;
}

/**
 * Classify event type from summary text using keyword heuristics.
 * Returns [eventType, targetLayer, categoryTag].
 */
function classifyEvent(summary, tags, region) {
  const lower = (summary || '').toLowerCase();
  const allText = lower + ' ' + (Array.isArray(tags) ? tags.join(' ') : '');

  // Layer detection — events that belong outside the protests layer
  if (/\b(earthquake|volcano|tsunami|flood|hurricane|typhoon|cyclone|wildfire|landslide|eruption)\b/i.test(allText)) {
    return ['UNREST_EVENT_TYPE_CIVIL_UNREST', 'natural', '_category:natural__layer:natural'];
  }
  if (/\b(military|missile|strike|bomb|attack|troop|irgc|ballistic|weapon|satellite|launched)\b/i.test(allText)) {
    return ['UNREST_EVENT_TYPE_CIVIL_UNREST', 'protests', '_category:military__layer:conflicts'];
  }

  // Event type (within protests layer)
  if (/\b(riot|clash|tear gas|violence|confront|violent|stone|petrol bomb|barricade)\b/i.test(allText)) {
    return ['UNREST_EVENT_TYPE_RIOT', 'protests', '_category:riot__layer:protests'];
  }
  if (/\b(strike|walkout|boycott)\b/i.test(allText)) {
    return ['UNREST_EVENT_TYPE_STRIKE', 'protests', '_category:strike__layer:protests'];
  }
  if (/\b(march|rally|demonstration|gather|sit-in|assembly|human chain|candlelight)\b/i.test(allText)) {
    return ['UNREST_EVENT_TYPE_DEMONSTRATION', 'protests', '_category:demonstration__layer:protests'];
  }
  if (/\b(protest|unrest|uprising|demonstrat)\b/i.test(allText)) {
    return ['UNREST_EVENT_TYPE_PROTEST', 'protests', '_category:protest__layer:protests'];
  }

  return ['UNREST_EVENT_TYPE_PROTEST', 'protests', '_category:protest__layer:protests'];
}

function mapEvent(e) {
  const occurredAt = e.date_dir ? new Date(e.date_dir).getTime() : Date.now();
  const tags = e.segments ? Object.keys(e.segments) : [];
  const summary = e.summary || '';

  // Determine country
  let country = '';
  if (tags.find(t => /hong kong|china|hongkong/i.test(t))) country = 'Hong Kong';
  else if (tags.find(t => /iran|tehran|mashhad|isfahan|tabriz|shiraz|qom|karaj|ahvaz|kermanshah|rasht|zahedan/i.test(t))) country = 'Iran';
  if (!country) {
    if (/hongkong/i.test(e.region || '')) country = 'Hong Kong';
    else if (/iran/i.test(e.region || '')) country = 'Iran';
  }

  // Classify event type and target layer
  const [eventType, targetLayer, categoryTag] = classifyEvent(summary, tags, e.region || '');

  // Detect city from summary + tags
  const city = extractCityFromSummary(summary, country, tags) || '';

  // Infer location
  const inferred = inferLocation(tags, summary, country);
  let location = inferred ? { ...inferred.location } : undefined;

  // Add jitter for country-level centroids to avoid all stacking at one point
  if (location && inferred.source === 'country') {
    const jitter = locationJitter(e.id || String(Math.random()), 0.6);
    location.latitude += jitter.latitude;
    location.longitude += jitter.longitude;
  }

  // If city was detected from summary, prefer its exact coordinates
  if (city && CITY_COORDS[city]) {
    location = { ...CITY_COORDS[city] };
  }

  // Append layer/category tag for client-side routing
  const enrichedTags = [...tags, categoryTag];

  return {
    id: `edas:${e.id}`,
    title: e.title || '',
    summary,
    eventType,
    city,
    country,
    region: e.region || '',
    location,
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
}

function makeEnvelope(obj) {
  return {
    _seed: { source: 'edas', generatedAt: Date.now() },
    data: obj,
  };
}

async function writeToUpstash(key, value) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.log('UPSTASH env not set; skipping remote write. Previewing payload.');
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  const body = JSON.stringify({
    commands: [['SET', key, JSON.stringify(value), 'EX', 86400]],
  });
  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body });
  const json = await res.json();
  console.log('Upstash response:', json);
}

async function main() {
  if (!fs.existsSync(eventsPath)) {
    console.error('events.json not found at', eventsPath);
    process.exit(1);
  }
  const raw = fs.readFileSync(eventsPath, 'utf8');
  const parsed = JSON.parse(raw);
  const events = parsed.map(mapEvent);
  const envelope = makeEnvelope({ events });

  // Local dump for verification
  const outPath = path.join(root, 'tmp', 'edas-seed-preview.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(envelope, null, 2));
  console.log('Wrote preview to', outPath);

  // Write to Redis (Upstash REST) if credentials provided
  await writeToUpstash('unrest:events:v1', envelope);
}

main().catch((err) => { console.error(err); process.exit(1); });
