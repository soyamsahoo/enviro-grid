import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Lazily-initialized Supabase client. Returns null when env vars are absent. */
export function getSupabase(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  if (!client) {
    client = createClient(url, anonKey);
  }
  return client;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
  );
}

/**
 * Verifies the ENVIROGRID tables exist in the connected Supabase project.
 * Returns { ready, missingTables } — misspelled/missing env or network
 * failures never throw.
 */
export async function checkSupabaseTables(): Promise<{
  ready: boolean;
  missingTables: string[];
}> {
  const sb = getSupabase();
  if (!sb) return { ready: false, missingTables: [] };

  const tables = [
    "cached_environmental_data",
    "species_cache",
    "user_search_history",
  ];
  const missingTables: string[] = [];

  await Promise.all(
    tables.map(async (table) => {
      try {
        const { error } = await sb.from(table).select("id").limit(1);
        const code = String(error?.code ?? "");
        const message = String(error?.message ?? "").toLowerCase();
        const notFound =
          code === "42P01" ||
          code === "PGRST205" ||
          /does not exist/.test(message) ||
          /not found/.test(message) ||
          /relation /.test(message) && /does not exist/.test(message);
        if (error && notFound) missingTables.push(table);
      } catch {
        missingTables.push(table);
      }
    }),
  );

  return { ready: missingTables.length === 0, missingTables };
}