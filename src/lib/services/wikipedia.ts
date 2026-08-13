import { fetchJson } from "./http";
import type { SpeciesMeta } from "./gbif";

interface WikipediaSummary {
  title?: string;
  extract?: string;
  thumbnail?: { source?: string };
  pageid?: number;
}

const BASE = "https://en.wikipedia.org/api/rest_v1/page/summary/";

/**
 * GBIF scientific names often carry authorship (e.g. "Donacia Fabricius, 1775")
 * which Wikipedia won't resolve. Build a fallback chain: full name ->
 * name minus author-year -> genus only.
 */
export function wikipediaNameCandidates(scientificName: string): string[] {
  const candidates: string[] = [];
  const underscore = (s: string) => s.replace(/\s+/g, "_").trim();

  candidates.push(underscore(scientificName));

  const strippedYear = scientificName.replace(/\s*,\s*\d{4}\s*$/g, "").trim();
  if (strippedYear && strippedYear !== scientificName) {
    candidates.push(underscore(strippedYear));
  }

  const genus = underscore(scientificName.split(/\s+/)[0]);
  if (genus && !candidates.includes(genus)) candidates.push(genus);

  return candidates;
}

/**
 * Enrich a scientific name with common name, description and photo URL
 * via the Wikipedia REST summary endpoint.
 * Returns null when no fallback page resolves.
 */
export async function fetchWikipediaSummary(
  scientificName: string,
): Promise<SpeciesMeta | null> {
  for (const candidate of wikipediaNameCandidates(scientificName)) {
    try {
      const data = await fetchJson<WikipediaSummary>(`${BASE}${encodeURIComponent(candidate)}`);
      if (!data || !data.title) continue;

      const meta: SpeciesMeta = {
        commonName: data.title !== scientificName ? data.title : undefined,
        imageUrl: data.thumbnail?.source,
        description: data.extract,
      };
      return meta;
    } catch {
      // 404 or network error — try the next candidate
    }
  }
  return null;
}

/** Fetch Wikipedia summaries for many species in parallel (bounded concurrency). */
export async function enrichMany(
  scientificNames: string[],
  concurrency = 6,
): Promise<Map<string, SpeciesMeta | null>> {
  const results = new Map<string, SpeciesMeta | null>();
  const queue = [...scientificNames];

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const name = queue.shift()!;
      if (results.has(name)) continue;
      try {
        results.set(name, await fetchWikipediaSummary(name));
      } catch {
        results.set(name, null);
      }
    }
  });

  await Promise.all(workers);
  return results;
}