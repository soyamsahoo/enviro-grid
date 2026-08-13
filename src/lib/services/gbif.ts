import { fetchJson } from "./http";
import type { BioIndicators, SpeciesObservation, TaxonGroup } from "@/lib/types";

const BASE = "https://api.gbif.org/v1";

interface GbifOccurrence {
  species?: string | null;
  scientificName?: string | null;
  speciesKey?: number | null;
  taxonKey?: number | null;
  kingdom?: string | null;
  class?: string | null;
  order?: string | null;
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

export interface BiodiversityResult {
  species: GbifOccurrenceResult[];
  taxonomy: { groups: TaxonGroup[]; indicators: BioIndicators };
}

/** Map GBIF taxonomic ranks to our display groups. */
const GROUP_RULES: Array<[string, string]> = [
  ["Birds", "class=Aves"],
  ["Mammals", "class=Mammalia"],
  ["Reptiles", "class=Reptilia"],
  ["Amphibians", "class=Amphibia"],
  ["Fish", "class=Actinopterygii"],
  ["Insects", "class=Insecta"],
  ["Arachnids", "class=Arachnida"],
  ["Plants", "kingdom=Plantae"],
  ["Fungi", "kingdom=Fungi"],
];

function groupKey(kingdom: string | null, class_: string | null): string {
  for (const [label, rule] of GROUP_RULES) {
    const [rank, value] = rule.split("=");
    const actual = rank === "kingdom" ? kingdom : class_;
    if (actual === value) return label;
  }
  return "Other";
}

/**
 * Query GBIF occurrence records within `radiusMeters` (default 15 km).
 * Returns unique species aggregated by count plus a taxonomic breakdown
 * (Birds / Mammals / Plants / …) and bio-indicator counts
 * (bees = Hymenoptera, butterflies = Lepidoptera, amphibians).
 */
export async function fetchBiodiversity(
  lat: number,
  lon: number,
  radiusMeters = 15000,
  limit = 300,
): Promise<BiodiversityResult> {
  const url =
    `${BASE}/occurrence/search?decimalLatitude=${lat}&decimalLongitude=${lon}` +
    `&radius=${radiusMeters}&limit=${limit}&hasCoordinate=true`;

  const data = await fetchJson<GbifSearchResponse>(url);

  const speciesMap = new Map<string, { count: number; gbifKey?: number }>();
  const groupCounts = new Map<string, number>();
  let bees = 0;
  let butterflies = 0;
  let amphibians = 0;

  for (const o of data.results ?? []) {
    const name = o.species ?? o.scientificName;
    if (name) {
      const entry = speciesMap.get(name) ?? {
        count: 0,
        gbifKey: o.speciesKey ?? o.taxonKey ?? undefined,
      };
      entry.count += 1;
      speciesMap.set(name, entry);
    }

    const group = groupKey(o.kingdom ?? null, o.class ?? null);
    groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1);

    const order = o.order ?? "";
    if (order === "Hymenoptera") bees += 1;
    if (order === "Lepidoptera") butterflies += 1;
    if (o.class === "Amphibia") amphibians += 1;
  }

  const species = [...speciesMap.entries()]
    .map(([scientificName, { count, gbifKey }]) => ({
      scientificName,
      gbifKey,
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 40);

  const groups: TaxonGroup[] = [...groupCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const totalSensitive = bees + butterflies + amphibians;

  return {
    species,
    taxonomy: {
      groups,
      indicators: {
        present: totalSensitive > 0,
        bees,
        butterflies,
        amphibians,
        total_sensitive: totalSensitive,
      },
    },
  };
}

export interface SpeciesMeta {
  commonName?: string;
  imageUrl?: string;
  description?: string;
}

export { BASE as GBIF_BASE, SpeciesObservation };
