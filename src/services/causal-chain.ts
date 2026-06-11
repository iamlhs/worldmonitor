/**
 * Causal Chain Detection — build event causality links from EDAS data.
 *
 * Heuristics used (in priority order):
 * 1. Causal language match — summary contains "led to", "caused", etc.
 * 2. Keyword overlap — events sharing significant segment keywords
 * 3. Time proximity — close-in-time events in the same region
 */

// ── Types ──

export interface CausalEvent {
  id: string;
  title: string;
  summary: string;
  date: string;
  region: string;
  segments: Record<string, number | string>;
  bursty: boolean;
}

export interface CausalLink {
  source: string;       // event id
  target: string;       // event id
  type: 'causal_language' | 'keyword_overlap' | 'temporal' | 'same_topic';
  confidence: number;   // 0-1
  label: string;        // human-readable relationship
  timeGapHours: number;
}

export interface CausalChain {
  events: CausalEvent[];
  links: CausalLink[];
  chains: CausalEvent[][]; // grouped causal paths
}

// ── Causal language patterns (Chinese + English) ──

const CAUSAL_PATTERNS_ENG = [
  /\bled\s?to\b/i, /\bcaused?\b/i, /\btriggered?\b/i, /\bsparked?\b/i,
  /\bfueled?\b/i, /\bresult(?:ed|ing)\s+in\b/i, /\bdue\s+to\b/i,
  /\bbecause\s+of\b/i, /\bprompted?\b/i, /\bprovoked?\b/i,
  /\bescalated?\b/i, /\bamid\b/i, /\bfollowing\b/i,
  /\bin\s+response\s+to\b/i, /\bas\s+a\s+result\b/i,
  /\bcontributed?\s+to\b/i, /\bworsened?\b/i, /\bintensified?\b/i,
  /\bexacerbated?\b/i, /\bspiraled?\b/i,
];

const CAUSAL_PATTERNS_ZH = [
  /导致/i, /引发/i, /触发/i, /促使/i, /由于/i, /因为/i,
  /加剧/i, /升级/i, /恶化/i, /引发.*反应/i, /响应/i,
  /结果/i, /从而/i, /以至于/i, /致使/i,
];

// ── Stop words to filter out from keyword matching ──

const STOP_WORDS = new Set([
  'hong kong', 'china', 'iran', 'ukraine', 'russia', 'news', 'update',
  'video', 'photo', 'report', 'breaking', 'just', 'new', 'one',
  'people', 'police', 'government', 'city', 'day', 'time',
]);

// ── Main API ──

/**
 * Build a causal chain from a list of events.
 */
export function buildCausalChain(events: CausalEvent[]): CausalChain {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  const links: CausalLink[] = [];

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const link = detectCausality(sorted[i], sorted[j]);
      if (link) links.push(link);
    }
  }

  // Build connected chains
  const chains = groupIntoChains(sorted, links);

  return { events: sorted, links, chains };
}

/**
 * Get a causal chain focused on a specific event (shows its context).
 */
export function getContextChain(events: CausalEvent[], focusId: string, windowSize = 10): CausalChain {
  const idx = events.findIndex(e => e.id === focusId);
  if (idx === -1) return buildCausalChain(events.slice(0, Math.min(20, events.length)));

  const start = Math.max(0, idx - Math.floor(windowSize / 2));
  const end = Math.min(events.length, idx + Math.ceil(windowSize / 2));
  const windowed = events.slice(start, end);
  return buildCausalChain(windowed);
}

// ── Detection Logic ──

function detectCausality(a: CausalEvent, b: CausalEvent): CausalLink | null {
  const sameRegion = a.region === b.region;
  if (!sameRegion) return null; // only link events in the same region

  const timeGapMs = new Date(b.date).getTime() - new Date(a.date).getTime();
  const timeGapHours = timeGapMs / (1000 * 60 * 60);

  // Skip if events are too far apart (> 30 days) or negative (wrong order)
  if (timeGapHours < 0 || timeGapHours > 30 * 24) return null;

  const combinedText = `${a.summary} ${b.summary}`;

  // 1) Causal language match (highest confidence)
  const causalMatch = checkCausalLanguage(a.summary, b.summary, combinedText);
  if (causalMatch) {
    return {
      source: a.id, target: b.id,
      type: 'causal_language',
      confidence: 0.75,
      label: causalMatch,
      timeGapHours: Math.round(timeGapHours),
    };
  }

  // 2) Strong keyword overlap (both events share unique keywords)
  const overlap = keywordOverlap(a.segments, b.segments);
  if (overlap.score > 2.0) {
    return {
      source: a.id, target: b.id,
      type: 'keyword_overlap',
      confidence: Math.min(0.7, 0.3 + overlap.score * 0.1),
      label: overlap.topWords.slice(0, 3).join(', '),
      timeGapHours: Math.round(timeGapHours),
    };
  }

  // 3) Temporal proximity + same region + same topic
  if (timeGapHours < 48 && overlap.score > 0.5) {
    return {
      source: a.id, target: b.id,
      type: 'temporal',
      confidence: Math.max(0.2, 0.35 - timeGapHours / (48 * 2)),
      label: `${Math.round(timeGapHours)}h later`,
      timeGapHours: Math.round(timeGapHours),
    };
  }

  return null;
}

function checkCausalLanguage(summaryA: string, summaryB: string, both: string): string | null {
  // Check if summary B uses causal language referencing concepts from A
  for (const pat of [...CAUSAL_PATTERNS_ENG, ...CAUSAL_PATTERNS_ZH]) {
    const match = summaryB.match(pat);
    if (match) return match[0].length > 15 ? match[0].slice(0, 15) + '…' : match[0];
  }
  // Also check combined text
  for (const pat of [...CAUSAL_PATTERNS_ENG, ...CAUSAL_PATTERNS_ZH]) {
    const match = both.match(pat);
    if (match) return match[0].length > 15 ? match[0].slice(0, 15) + '…' : match[0];
  }
  return null;
}

function keywordOverlap(
  segA: Record<string, number | string>,
  segB: Record<string, number | string>,
): { score: number; topWords: string[] } {
  const keysA = Object.keys(segA).filter(k => !STOP_WORDS.has(k.toLowerCase()));
  const keysB = Object.keys(segB).filter(k => !STOP_WORDS.has(k.toLowerCase()));

  const setB = new Set(keysB.map(k => k.toLowerCase()));
  const overlap: Array<{ word: string; weight: number }> = [];

  for (const key of keysA) {
    const lower = key.toLowerCase();
    if (setB.has(lower)) {
      const weightA = Number(segA[key]) || 1;
      const weightB = Number(segB[lower]) || 1;
      overlap.push({ word: key, weight: Math.min(weightA, weightB) });
    }
  }

  // Sort by combined weight
  overlap.sort((a, b) => b.weight - a.weight);
  const totalScore = overlap.reduce((sum, o) => sum + o.weight, 0) / 5;
  const topWords = overlap.slice(0, 5).map(o => o.word);

  return { score: totalScore, topWords };
}

function groupIntoChains(events: CausalEvent[], links: CausalLink[]): CausalEvent[][] {
  const adj = new Map<string, string[]>();
  for (const link of links) {
    if (!adj.has(link.source)) adj.set(link.source, []);
    adj.get(link.source)!.push(link.target);
  }

  const visited = new Set<string>();
  const chains: CausalEvent[][] = [];

  for (const event of events) {
    if (visited.has(event.id)) continue;
    const chain: CausalEvent[] = [];
    const queue = [event.id];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const ev = events.find(e => e.id === id);
      if (ev) chain.push(ev);
      const next = adj.get(id) || [];
      for (const n of next) {
        if (!visited.has(n)) queue.push(n);
      }
    }
    if (chain.length > 0) chains.push(chain);
  }

  return chains;
}
