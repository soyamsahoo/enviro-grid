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
 * Query GBIF occurrence records around a point.
 * NOTE: GBIF's `radius` param silently returns 0 results in the current
 * API version, so we query a bounding box derived from the radius instead
 * (equivalent coverage, works reliably). If the box is empty, the radius
 * is widened once (25 km) as a fallback.
 */
export async function fetchBiodiversity(
  lat: number,
  lon: number,
  radiusMeters = 15000,
  limit = 300,
): Promise<BiodiversityResult> {
  let data = await searchBox(lat, lon, radiusMeters, limit);
  if ((data.count ?? 0) === 0) {
    data = await searchBox(lat, lon, 25000, limit);
  }
  return buildResult(data);
}

async function searchBox(
  lat: number,
  lon: number,
  radiusMeters: number,
  limit: number,
): Promise<GbifSearchResponse> {
  const degLat = radiusMeters / 111320;
  const degLon = radiusMeters / (111320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const url =
    `${BASE}/occurrence/search?decimalLatitude=${(lat - degLat).toFixed(4)},${(lat + degLat).toFixed(4)}` +
    `&decimalLongitude=${(lon - degLon).toFixed(4)},${(lon + degLon).toFixed(4)}` +
    `&limit=${limit}&hasCoordinate=true`;
  return fetchJson<GbifSearchResponse>(url);
}

function buildResult(data: GbifSearchResponse): BiodiversityResult {
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
