import type { SpeciesObservation } from "@/lib/types";
import { fetchJson } from "./http";

const BASE = "https://api.gbif.org/v1";

interface GbifOccurrence {
  species?: string | null;
  scientificName?: string | null;
  speciesKey?: number | null;
  taxonKey?: number | null;
}

interface GbifSearchResponse {
  count?: number;
  results?: GbifOccurrence[];
}

export interface GbifOccurrenceResult {
  scientificName: string;
  gbifKey?: number;
  count: number;
}

/**
 * Query GBIF occurrence records within `radiusMeters` (default 15 km).
 * Returns unique species aggregated by count, descending.
 */
export async function fetchBiodiversity(
  lat: number,
  lon: number,
  radiusMeters = 15000,
  limit = 300,
): Promise<GbifOccurrenceResult[]> {
  const url =
    `${BASE}/occurrence/search?decimalLatitude=${lat}&decimalLongitude=${lon}` +
    `&radius=${radiusMeters}&limit=${limit}&hasCoordinate=true`;

  const data = await fetchJson<GbifSearchResponse>(url);

  const counts = new Map<string, { count: number; gbifKey?: number }>();
  for (const o of data.results ?? []) {
    const name = o.species ?? o.scientificName;
    if (!name) continue;
    const entry = counts.get(name) ?? { count: 0, gbifKey: o.speciesKey ?? o.taxonKey ?? undefined };
    entry.count += 1;
    counts.set(name, entry);
  }

  return [...counts.entries()]
    .map(([scientificName, { count, gbifKey }]) => ({
      scientificName,
      gbifKey,
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 40);
}

export interface SpeciesMeta {
  commonName?: string;
  imageUrl?: string;
  description?: string;
}

export { BASE as GBIF_BASE };

export type { SpeciesObservation };