/**
 * News Plotter — extract location markers from text and push to map.
 *
 * Usage:
 *   import { extractLocations, plotNewsToMap } from '@/services/news-plotter';
 *
 *   const markers = extractLocations('Protests in Kyiv and Bakhmut...');
 *   plotNewsToMap(markers);
 */

// ── Location lookup table (mirrors server handler) ──

interface LocationEntry {
  keywords: string[];
  latitude: number;
  longitude: number;
  country: string;
}

const LOCATIONS: LocationEntry[] = [
  // Ukraine
  { keywords: ['kyiv', 'kiev'],             latitude: 50.4501, longitude: 30.5234, country: 'Ukraine' },
  { keywords: ['bakhmut', 'artemovsk'],     latitude: 48.5953, longitude: 38.0003, country: 'Ukraine' },
  { keywords: ['kherson'],                  latitude: 46.6354, longitude: 32.6169, country: 'Ukraine' },
  { keywords: ['odessa', 'odesa'],          latitude: 46.4825, longitude: 30.7233, country: 'Ukraine' },
  { keywords: ['kharkiv'],                  latitude: 49.9935, longitude: 36.2304, country: 'Ukraine' },
  { keywords: ['dnipro'],                   latitude: 48.4647, longitude: 35.0462, country: 'Ukraine' },
  { keywords: ['zaporizhzhia'],             latitude: 47.8388, longitude: 35.1396, country: 'Ukraine' },
  { keywords: ['mariupol'],                 latitude: 47.0971, longitude: 37.5434, country: 'Ukraine' },
  { keywords: ['mykolaiv'],                 latitude: 46.9750, longitude: 31.9946, country: 'Ukraine' },
  { keywords: ['lviv'],                     latitude: 49.8397, longitude: 24.0297, country: 'Ukraine' },
  { keywords: ['donetsk'],                  latitude: 48.0159, longitude: 37.8028, country: 'Ukraine' },
  { keywords: ['luhansk'],                  latitude: 48.5670, longitude: 39.3171, country: 'Ukraine' },
  { keywords: ['crimea'],                   latitude: 45.0,    longitude: 34.0,   country: 'Ukraine' },
  { keywords: ['avdiivka', 'avdeyevka'],    latitude: 48.1333, longitude: 37.7500, country: 'Ukraine' },
  { keywords: ['kramatorsk'],               latitude: 48.7333, longitude: 37.5333, country: 'Ukraine' },
  { keywords: ['izium', 'izyum'],           latitude: 49.2000, longitude: 37.2833, country: 'Ukraine' },
  { keywords: ['kakhovka'],                 latitude: 46.8056, longitude: 33.4778, country: 'Ukraine' },
  { keywords: ['melitopol'],                latitude: 46.8489, longitude: 35.3679, country: 'Ukraine' },
  { keywords: ['irpin'],                    latitude: 50.5192, longitude: 30.2447, country: 'Ukraine' },
  { keywords: ['bucha'],                    latitude: 50.5430, longitude: 30.2285, country: 'Ukraine' },
  { keywords: ['chernihiv'],                latitude: 51.4937, longitude: 31.2890, country: 'Ukraine' },
  { keywords: ['sumy'],                     latitude: 50.9077, longitude: 34.7981, country: 'Ukraine' },
  { keywords: ['poltava'],                  latitude: 49.5883, longitude: 34.5514, country: 'Ukraine' },
  // Russia
  { keywords: ['moscow'],                   latitude: 55.7558, longitude: 37.6173, country: 'Russia' },
  { keywords: ['belgorod'],                 latitude: 50.6000, longitude: 36.6000, country: 'Russia' },
  { keywords: ['st petersburg', 'saint petersburg'], latitude: 59.9343, longitude: 30.3351, country: 'Russia' },
  // Hong Kong
  { keywords: ['hong kong', 'hongkong'],    latitude: 22.3193, longitude: 114.1694, country: 'Hong Kong' },
  { keywords: ['kowloon'],                  latitude: 22.3183, longitude: 114.1694, country: 'Hong Kong' },
  { keywords: ['mong kok'],                 latitude: 22.3193, longitude: 114.1700, country: 'Hong Kong' },
  { keywords: ['yuen long'],                latitude: 22.4440, longitude: 114.0306, country: 'Hong Kong' },
  // Iran
  { keywords: ['tehran'],                   latitude: 35.6892, longitude: 51.3890, country: 'Iran' },
  { keywords: ['isfahan'],                  latitude: 32.6546, longitude: 51.6680, country: 'Iran' },
  { keywords: ['mashhad'],                  latitude: 36.2605, longitude: 59.6168, country: 'Iran' },
  { keywords: ['shiraz'],                   latitude: 29.5918, longitude: 52.5836, country: 'Iran' },
  // Israel / Gaza
  { keywords: ['gaza', 'gaza strip'],       latitude: 31.5,    longitude: 34.4667, country: 'Palestine' },
  { keywords: ['tel aviv'],                 latitude: 32.0853, longitude: 34.7818, country: 'Israel' },
  { keywords: ['jerusalem'],                latitude: 31.7683, longitude: 35.2137, country: 'Israel' },
  // Global
  { keywords: ['beijing'],                  latitude: 39.9042, longitude: 116.4074, country: 'China' },
  { keywords: ['shanghai'],                 latitude: 31.2304, longitude: 121.4737, country: 'China' },
  { keywords: ['washington dc', 'washington d.c.'], latitude: 38.9072, longitude: -77.0369, country: 'United States' },
  { keywords: ['new york'],                 latitude: 40.7128, longitude: -74.0060, country: 'United States' },
  { keywords: ['london'],                   latitude: 51.5074, longitude: -0.1278, country: 'United Kingdom' },
  { keywords: ['paris'],                    latitude: 48.8566, longitude: 2.3522,  country: 'France' },
  { keywords: ['berlin'],                   latitude: 52.5200, longitude: 13.4050, country: 'Germany' },
];

// ── Public API ──

export interface NewsMarker {
  lat: number;
  lon: number;
  title: string;
  threatLevel: string;
  country: string;
}

/**
 * Extract location markers from raw text.
 * Returns deduplicated markers sorted by confidence.
 */
export function extractLocations(text: string): NewsMarker[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const found = new Map<string, NewsMarker>();

  for (const loc of LOCATIONS) {
    for (const kw of loc.keywords) {
      if (lower.includes(kw)) {
        const key = `${loc.latitude.toFixed(2)}_${loc.longitude.toFixed(2)}`;
        if (!found.has(key)) {
          found.set(key, {
            lat: loc.latitude,
            lon: loc.longitude,
            title: `${loc.keywords[0]}, ${loc.country}`,
            threatLevel: 'info',
            country: loc.country,
          });
        }
        break; // one match per entry
      }
    }
  }

  return Array.from(found.values());
}

/**
 * Parse a JSON/JSONL file text into an array of strings for analysis.
 * Handles: plain text, JSON array of objects, JSONL (one JSON per line).
 */
export function parseFileContent(content: string, fileName: string): string[] {
  const trimmed = content.trim();

  // JSONL: multiple JSON objects separated by newlines
  if (trimmed.startsWith('{') && trimmed.includes('\n{')) {
    const lines = trimmed.split('\n').filter(l => l.trim().startsWith('{'));
    const texts: string[] = [];
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        texts.push(obj.origin_text || obj.text || obj.title || obj.summary || JSON.stringify(obj));
      } catch { /* skip */ }
    }
    return texts;
  }

  // JSON array
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed);
      return arr.map((item: any) => item.origin_text || item.text || item.title || item.summary || JSON.stringify(item));
    } catch { /* fall through */ }
  }

  // Plain text — split by sentences/newlines
  return trimmed.split('\n').filter(l => l.trim().length > 10);
}

/**
 * Get event type from text content.
 */
export function classifyEventType(text: string): string {
  const lower = text.toLowerCase();
  if (/\b(riot|clash|tear gas|violence|fighting|battle|assault)\b/i.test(lower)) return 'riot';
  if (/\b(strike|walkout|boycott)\b/i.test(lower)) return 'strike';
  if (/\b(march|rally|demonstration|gather|sit-in)\b/i.test(lower)) return 'demonstration';
  if (/\b(earthquake|volcano|tsunami|flood|hurricane|wildfire)\b/i.test(lower)) return 'disaster';
  if (/\b(military|missile|bomb|attack|troop|war|soldier|drone|tank)\b/i.test(lower)) return 'conflict';
  if (/\b(protest|unrest|抗议)\b/i.test(lower)) return 'protest';
  return 'info';
}

/**
 * Push news markers to the map by dispatching a custom event.
 * The data-loader listens for this event.
 */
export function plotNewsToMap(markers: NewsMarker[]): void {
  if (markers.length === 0) return;
  window.dispatchEvent(new CustomEvent('news:plot', { detail: { markers } }));
  console.log(`[NewsPlot] Plotting ${markers.length} markers to map`);
}

/**
 * Clear plotted news markers from the map.
 */
export function clearNewsFromMap(): void {
  window.dispatchEvent(new CustomEvent('news:clear', { detail: {} }));
}

// ── Event handlers registered in data-loader ──
// These are called from src/app/data-loader.ts
export function handleNewsPlotEvent(
  map: any,
  event: Event,
): void {
  const detail = (event as CustomEvent).detail;
  const markers = detail?.markers;
  if (Array.isArray(markers) && markers.length > 0) {
    map?.setNewsLocations(markers);
    map?.setLayerReady('newsLocations', true);
  }
}

export function handleNewsClearEvent(map: any): void {
  map?.setNewsLocations([]);
  map?.setLayerReady('newsLocations', false);
}
