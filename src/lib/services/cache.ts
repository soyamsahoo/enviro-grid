import { getSupabase } from "./supabase";

const CACHE_TTL_MS = 15 * 60 * 1000; // 15-minute TTL

export interface CacheHit<T> {
  hit: boolean;
  payload?: T;
}

/**
 * Reads a cached aggregated payload from Supabase if a fresh row
 * (fetched within the 15-minute TTL) exists within `radiusMeters`.
 */
export async function readCache<T>(lat: number, lon: number): Promise<CacheHit<T>> {
  const sb = getSupabase();
  if (!sb) return { hit: false };

  try {
    const { data, error } = await sb
      .from("cached_environmental_data")
      .select("payload")
      .gt("expires_at", new Date().toISOString())
      .eq("lat", lat)
      .eq("lon", lon)
      .limit(1);

    if (error) return { hit: false };
    if (!data || data.length === 0) return { hit: false };
    return { hit: true, payload: data[0].payload as T };
  } catch {
    return { hit: false };
  }
}

/**
 * Writes the aggregated payload into the cache. Fire-and-forget:
 * failures must never block the dashboard.
 */
export async function writeCache<T>(
  lat: number,
  lon: number,
  payload: T,
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + CACHE_TTL_MS);

  try {
    await sb.from("cached_environmental_data").insert({
      lat,
      lon,
      payload,
      fetched_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    });
  } catch {
    // swallow — cache is best-effort
  }
}
