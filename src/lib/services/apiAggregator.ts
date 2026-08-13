import type { AggregatePayload } from "@/lib/types";
import { fetchAirQuality, emptyAirQuality, fetchAqiForecast } from "./openaq";
import { fetchMicroclimate, emptyMicroclimate, fetchHistoricalAverages } from "./openmeteo";
import { fetchFireHotspots } from "./nasafirms";
import { fetchBiodiversity } from "./gbif";
import { enrichMany } from "./wikipedia";
import { readCache, writeCache } from "./cache";
import type { SpeciesMeta } from "./gbif";
import { getSupabase } from "./supabase";

/** Never lets one provider failure reject the whole aggregation. */
async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    console.warn("[aggregator] provider failed; using fallback:", err);
    return fallback;
  }
}

/** Backfills fields absent from payloads cached before v2 features landed. */
function normalizePayload(p: AggregatePayload): AggregatePayload {
  return {
    ...p,
    aqi_forecast: p.aqi_forecast ?? [],
    history: p.history ?? { aqi_yesterday_avg: null, temp_avg_30d: null, humidity_avg_30d: null },
    taxonomy: p.taxonomy ?? {
      groups: [],
      indicators: { present: false, bees: 0, butterflies: 0, amphibians: 0, total_sensitive: 0 },
    },
  };
}

export interface AggregatorOptions {
  lat: number;
  lon: number;
  name?: string;
  useCache?: boolean;
}

export interface AggregatorResult {
  payload: AggregatePayload;
  fromCache: boolean;
}

/**
 * Fetches all environmental data layers in parallel for a coordinate,
 * applies the 15-minute Supabase cache, and enriches species via Wikipedia.
 */
export async function aggregateEnvironment(
  options: AggregatorOptions,
): Promise<AggregatorResult> {
  const { lat, lon, name, useCache = true } = options;
  const rounded = { lat: Math.round(lat * 4) / 4, lon: Math.round(lon * 4) / 4 };

  if (useCache) {
    const cached = await readCache<AggregatePayload>(rounded.lat, rounded.lon);
    if (cached.hit && cached.payload) {
      return { payload: normalizePayload(cached.payload), fromCache: true };
    }
  }

  const [airQuality, microclimate, fireHotspots, bioResult, aqiForecast, history] =
    await Promise.all([
      safe(fetchAirQuality(lat, lon), emptyAirQuality()),
      safe(fetchMicroclimate(lat, lon), emptyMicroclimate()),
      safe(fetchFireHotspots(lat, lon), []),
      safe(fetchBiodiversity(lat, lon), {
        species: [],
        taxonomy: { groups: [], indicators: { present: false, bees: 0, butterflies: 0, amphibians: 0, total_sensitive: 0 } },
      }),
      safe(fetchAqiForecast(lat, lon), { forecast: [], aqi_yesterday_avg: null }),
      safe(fetchHistoricalAverages(lat, lon), { temp_avg_30d: null, humidity_avg_30d: null }),
    ]);

  const enriched = await enrichSpecies(bioResult.species);

  const payload: AggregatePayload = {
    location: { lat, lon, name },
    fetched_at: new Date().toISOString(),
    air_quality: airQuality,
    microclimate,
    fire_hotspots: fireHotspots,
    biodiversity: enriched.species,
    total_occurrences: enriched.totalOccurrences,
    aqi_forecast: aqiForecast.forecast,
    history: {
      aqi_yesterday_avg: aqiForecast.aqi_yesterday_avg,
      temp_avg_30d: history.temp_avg_30d,
      humidity_avg_30d: history.humidity_avg_30d,
    },
    taxonomy: bioResult.taxonomy,
  };

  await writeCache(rounded.lat, rounded.lon, payload);
  return { payload, fromCache: false };
}

/**
 * Maps GBIF results to Wikipedia-enriched species, reusing the
 * Supabase `species_cache` table to avoid re-hitting the network.
 */
async function enrichSpecies(
  occurrences: AggregatePayload["biodiversity"],
): Promise<{ species: AggregatePayload["biodiversity"]; totalOccurrences: number }> {
  const sb = getSupabase();
  const dbMeta = new Map<string, SpeciesMeta>();

  if (sb) {
    try {
      const names = occurrences.map((o) => o.scientificName);
      const { data } = await sb
        .from("species_cache")
        .select("scientific_name, common_name, image_url, summary_json")
        .in("scientific_name", names);
      for (const row of data ?? []) {
        dbMeta.set(row.scientific_name, {
          commonName: row.common_name ?? undefined,
          imageUrl: row.image_url ?? undefined,
          description: row.summary_json?.extract ?? undefined,
        });
      }
    } catch {
      // fall through to live enrichment
    }
  }

  const namesToFetch = occurrences
    .map((o) => o.scientificName)
    .filter((n) => !dbMeta.has(n));

  const live = await enrichMany(namesToFetch);

  if (sb && live.size) {
    try {
      const rows = [...live.entries()].map(([scientificName, meta]) => ({
        scientific_name: scientificName,
        common_name: meta?.commonName ?? null,
        image_url: meta?.imageUrl ?? null,
        summary_json: meta?.description ? { extract: meta.description } : null,
      }));
      await sb.from("species_cache").upsert(rows, { onConflict: "scientific_name" });
    } catch {
      // cache write is best-effort
    }
  }

  const species = occurrences.map((o) => {
    const meta = dbMeta.get(o.scientificName) ?? live.get(o.scientificName) ?? undefined;
    return {
      scientificName: o.scientificName,
      gbifKey: o.gbifKey,
      count: o.count,
      commonName: meta?.commonName,
      imageUrl: meta?.imageUrl,
    };
  });

  const totalOccurrences = species.reduce((sum, s) => sum + s.count, 0);
  return { species, totalOccurrences };
}

/** Records a search into user_search_history (best-effort). */
export async function recordSearch(
  lat: number,
  lon: number,
  persona: string,
  locationName?: string,
  personaHealthScore?: number,
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb.from("user_search_history").insert({
      lat,
      lon,
      persona,
      location_name: locationName ?? null,
      persona_health_score: personaHealthScore ?? null,
    });
  } catch {
    // best-effort
  }
}