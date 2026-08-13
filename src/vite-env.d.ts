/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly SUPABASE_SERVICE_ROLE_KEY?: string;
  readonly VITE_OPENAQ_API_KEY?: string;
  readonly VITE_NASA_FIRMS_MAP_KEY?: string;
  readonly VITE_LLM_API_KEY?: string;
  readonly VITE_LLM_PROVIDER?: "gemini" | "openai";
  readonly VITE_LLM_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
