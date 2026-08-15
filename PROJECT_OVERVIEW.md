# ENVIROGRID 2.0 — Complete Project Explanation

> Multi-source environmental intelligence dashboard. Pick a location, get a
> persona-aware health score, live air quality, microclimate, fire hotspots,
> biodiversity, forward forecasts, AI copilot chat, alerts, and snapshot
> export (JSON/CSV/PDF).

---

## 1. What the project is

ENVIROGRID is a single-page web application that turns raw environmental data
from **seven public providers** into a single, human-readable "environmental
health intelligence" view for any coordinate on Earth.

The core idea: instead of showing raw numbers, the app computes a
**persona-aware health score** (0–100) that weighs different environmental
factors differently depending on who is asking — an athlete, a respiratory
patient, an outdoor worker, a farmer, or a general citizen. It also lets you
compare commute routes by **how much toxic PM2.5 you would actually inhale**
(cigarette-equivalent dose modeling) and chat with an **AI copilot** that has
live context from the map, routes, and alerts.

## 2. Tech stack

| Layer | Technology |
|---|---|
| Build tool | Vite 5 |
| UI | React 18 + TypeScript (strict mode) |
| Styling | Tailwind CSS 3 + shadcn-style components (Radix slots, CVA, clsx) |
| Maps | MapLibre GL (satellite, AQI heatmap, fires, biodiversity, earthquakes) |
| Data fetching | TanStack Query (v5), staleTime caching |
| Charts | Recharts (area/trend chart) |
| Backend cache | Supabase (PostgreSQL + PostGIS), optional |
| AI | Google Gemini Interactions API (default), OpenAI provider fallback, local deterministic fallback |
| PDF export | jsPDF |
| Chat rendering | react-markdown + remark-gfm + remark-math + rehype-katex |
| Serverless API | Vercel functions (`/api/*`) |

## 3. Architecture

```
Browser (React SPA)
 ├─ src/pages/Dashboard.tsx          — single page, all sections orchestrated here
 ├─ src/components/                  — UI sections (map, score, chat, alerts, routes, dashboard)
 ├─ src/lib/services/                — data providers (OpenAQ, Open-Meteo, FIRMS, GBIF, Wikipedia, Supabase, HTTP, cache)
 ├─ src/lib/ai/                      — copilot, personas, prompt builder
 ├─ src/lib/                         — types, utils, exposure engine, forecast, routing, export
 ├─ api/                             — Vercel serverless proxies (same-origin to dodge CORS)
 └─ supabase/migrations/             — PostGIS-backed response cache tables
```

Key design decisions:

- **Same-origin API proxies.** OpenAQ, NASA FIRMS, and Google Gemini reject
  browser CORS preflights. The Vite dev server proxies `/api/*`, and Vercel
  serverless functions mirror the same paths (`api/gemini/v1beta/interactions`,
  `api/openaq/v3/locations`, `api/openaq/v3/locations/[id]/latest`,
  `api/firms/api/area/csv/...`). API keys stay server-side and never ship in
  the client bundle.
- **Provider isolation.** `safe()` in `apiAggregator.ts` wraps every provider
  call — one failing feed never breaks the whole dashboard; it falls back to
  empty data.
- **Resilient AI.** If no LLM key is present, a deterministic local scorer
  still produces a health score, so the app always works (Demo mode banner
  tells the user which keys are missing).
- **15-minute Supabase cache.** Aggregated payloads are keyed to a rounded
  coordinate (¼-degree grid) and stored as JSONB with a PostGIS geography
  column; reads look for fresh rows within a radius.

## 4. Data sources

| Source | What it provides | Radius |
|---|---|---|
| OpenAQ v3 | PM2.5, PM10, NO₂, O₃, US AQI (nearest stations + AQI heatmap grid) | local |
| Open-Meteo | Temperature, humidity, wind, UV, precipitation, weather codes, hourly AQI forecast (+3/+6/+12 h), 30-day historical averages | local |
| NASA FIRMS | Active fire hotspot points (FRP, confidence, satellite, date/time) | 100 km |
| GBIF | Species occurrence records, taxonomic groups, bio-indicators (bees, butterflies, amphibians) | 15 km |
| Wikipedia | Common names + species images for display enrichment | — |
| USGS (in map) | Earthquakes ≥ 2.5 magnitude in the last day, filtered near the search center | map viewport |
| BigDataCloud (in search) | Reverse geocoding for current-location + hierarchy | — |
| OSRM (in routes) | Driving route geometry between two pins (with straight-line fallback) | live map |

## 5. Dashboard sections (UI tour)

The app is a single page (`src/pages/Dashboard.tsx`, ~670 lines) that
orchestrates everything. Sections, top to bottom:

### 5.1 Header bar
- **Logo** — ENVIROGRID v2.0 brand with the radar icon.
- **LocationSearch** — search any place, or use the browser geolocation
  button (with reverse geocoding via BigDataCloud to name the location).
- **Routes button** — opens the RouteDrawer (dose comparison).
- **Alerts bell** — opens AlertsModal; shows a red badge with the number of
  currently triggered alert rules.
- **More menu** — pick a route mode: Fastest / Cleanest / Dangerous.
- **Export menu** — hover-to-open dropdown: download the current snapshot as
  **JSON, CSV, or PDF**.

### 5.2 Sub-header row
- **BreadcrumbNav** — spatial breadcrumbs (Country → Admin1 → City → Locality
  → Neighbourhood) that navigate the map to any ancestor region.
- **PersonaSelector** — switch the active persona (5 personas).
- **Live status** — "Live data · fetched X ago", with a `cached` tag when the
  payload came from the Supabase cache, and a spinner while feeds sync.

### 5.3 Banner area
- **Demo mode banner** — amber warning listing missing API keys / Supabase.
- **Supabase warning** — red banner listing missing tables when Supabase is
  configured but the migration hasn't run.

### 5.4 Hero section (`lg:grid-cols-[320px_1fr]`)
- **ExposureCard** — the headline: persona health score gauge (0–100), risk
  level (Low / Moderate / High / Severe), inhaled PM2.5 and cigarette
  equivalents for the persona's ventilation rate, with an activity/duration
  selector (runner/cyclist/walker × 5/15/30/60 min).
- **VerifiedWhyCard** — explains *why* the score is what it is: primary
  factor, headline, "verified why" rationale, and actionable advice. Tagged
  `LLM` when produced by the AI provider.
- **MetricsGrid** — live metric tiles: AQI (with category color), PM2.5,
  PM10, UV index, temperature, humidity, wind, rain probability, fire count.

### 5.5 Forecast cards
- **ForecastCards** — three cards for **+3 h / +6 h / +12 h**: predicted US
  AQI, category, risk tier color, temperature, and rain probability (built by
  `lib/forecast.ts` from the Open-Meteo AQ model).

### 5.6 Map + analytics row (`xl:grid-cols-[1fr_340px]`)
- **RadarMap** — MapLibre GL map with toggleable layers:
  - **Satellite** imagery base
  - **AQI heatmap** (interpolated grid from OpenAQ stations)
  - **Fire hotspots** (NASA FIRMS, sized by FRP)
  - **Biodiversity** occurrence points (GBIF)
  - **Earthquakes** (USGS, filtered near center)
  - **Draggable origin/destination pins** with a live OSRM route overlay
    whose geometry re-integrates the "edge-weight toxicity" (distance-weighted
    average PM2.5 along the path via bilinear interpolation on the AQI grid)
    on every drag.
- **DeltaBadges** — trend arrows vs. baselines: AQI vs. yesterday,
  temperature vs. 30-day average, humidity vs. 30-day average.
- **TrendChart** — Recharts area chart of the next 24 h AQI / PM2.5 forecast.
- **Data pipeline panel** — static info card listing the data sources and a
  "15-min cache · PostGIS-backed" badge plus active-alert count.

### 5.7 Biodiversity section
- **BioAnalytics** — taxonomic breakdown (birds, mammals, reptiles,
  amphibians, insects, plants, fungi, …) as chips/counts plus bio-indicator
  cards (bees, butterflies, amphibians, total sensitive species).
- **BiodiversityCarousel** — horizontally scrollable species cards with
  Wikipedia common names + images.

### 5.8 Footer
- Attribution line for all data providers.

### 5.9 Overlays / modals
- **AlertsModal** — create rules (metric, threshold, above/below, enable,
  optional email) persisted to `localStorage`; `evaluateAlerts` checks live
  payload values and flags triggers; active triggers also feed the copilot's
  context.
- **RouteDrawer** — dual-route dose comparison: **Fastest vs Cleanest vs
  Dangerous** with minutes, PM2.5, inhaled mass (µg), cigarette equivalents,
  exposure-reduction % vs. the alternative, activity selector (runner /
  cyclist / walker), and the live map route's own dose.
- **CopilotChat** — floating conversational AI assistant with suggested
  questions ("Is it safe to train outdoors right now?"), Markdown + LaTeX
  rendering, and grounded context: current route dose model, map route meta,
  and triggered alerts.

## 6. Core features (summary)

1. **Persona-aware health score** — 5 personas with distinct weighting
   profiles (`lib/ai/personas.ts`): athlete, respiratory patient, outdoor
   worker, farmer, general citizen.
2. **AI copilot with fallback chain** — Gemini Interactions (default) →
   OpenAI → deterministic local scorer (`lib/ai/copilot.ts`), strict-JSON
   scoring output, LLM-vs-local provenance tag.
3. **Live multi-source aggregation** — one parallel fetch of air quality,
   microclimate, fires, biodiversity, AQI forecast, and history; any provider
   can fail without breaking the dashboard.
4. **Forward forecasting** — +3/+6/+12 h AQI cards and a 24 h trend chart.
5. **Historical deltas** — AQI vs. yesterday, temperature/humidity vs. 30-day
   averages.
6. **Inhaled-dose engine** — `Inhaled PM2.5 = PM2.5 × ventilation rate × time`
   with cigarette equivalents (1 cigarette ≈ 22 µg).
7. **Toxic-aware route comparison** — fastest / cleanest / dangerous modes,
   live OSRM routing with per-edge AQI grid integration, drag-to-recompute.
8. **Interactive radar map** — 6 toggleable layers incl. AQI heatmap, fires,
   biodiversity, earthquakes.
9. **Alerts** — user-defined threshold rules with trigger detection and
   localStorage persistence.
10. **Snapshot export** — JSON / CSV / PDF of the full aggregated payload.
11. **Spatial navigation** — search, geolocation + reverse geocoding, and
    country → city → locality breadcrumbs.
12. **Biodiversity intelligence** — GBIF species + taxonomy + bio-indicator
    counts.
13. **Supabase response cache** — 15-minute TTL, PostGIS spatial index,
    coordinate-rounded lookup keys; gracefully disabled when unconfigured.
14. **Resilience & demo mode** — every external dependency has a local
    fallback and a visible status banner.

## 7. Serverless API functions (`api/`)

| Path | Purpose |
|---|---|
| `api/openaq/v3/locations.ts` | Proxies OpenAQ location search; injects server-side API key |
| `api/openaq/v3/locations/[id]/latest.ts` | Proxies latest measurements per station |
| `api/firms/api/area/csv/[key]/[source]/[bbox]/[day].ts` | Proxies NASA FIRMS area CSV (fire hotspots) |
| `api/gemini/v1beta/interactions.ts` | Proxies Google Gemini Interactions (LLM scoring + chat) |

All accept the client key as a fallback header (`x-goog-api-key`,
`x-api-key`) so local dev works too.

## 8. Environment variables

Client (Vite, `VITE_*` in `.env`):
- `VITE_OPENAQ_API_KEY`
- `VITE_NASA_FIRMS_MAP_KEY`
- `VITE_LLM_API_KEY`, `VITE_LLM_PROVIDER` (`gemini` | `openai`),
  `VITE_LLM_MODEL`
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (optional)

Server-only (Vercel): `OPENAQ_API_KEY`, `NASA_FIRMS_MAP_KEY`, `LLM_API_KEY`.

## 9. Getting started

```bash
cp .env.example .env   # fill in your keys
npm install
npm run dev            # http://localhost:5173 (proxies /api/*)
npm run build          # tsc -b && vite build → dist/
npm run lint           # tsc --noEmit
```

Deploy: push to GitHub → import in Vercel (Vite preset auto-detected) →
set env vars → the `api/*` files become serverless functions.
Optional: run `supabase/migrations/20260813000000_init.sql` in the Supabase
SQL editor to enable the PostGIS cache.

## 10. Project structure

```
envirogrid/
├─ api/                          # Vercel serverless proxies
│  ├─ firms/api/area/csv/[key]/[source]/[bbox]/[day].ts
│  ├─ gemini/v1beta/interactions.ts
│  └─ openaq/v3/locations.ts
│     └─ locations/[id]/latest.ts
├─ src/
│  ├─ App.tsx / main.tsx         # mounts the Dashboard
│  ├─ pages/Dashboard.tsx        # the entire single-page app
│  ├─ components/
│  │  ├─ alerts/AlertsModal.tsx  # alert rules + evaluation
│  │  ├─ chat/                   # CopilotChat + MarkdownMessage (KaTeX)
│  │  ├─ dashboard/              # LocationSearch, BreadcrumbNav, PersonaSelector,
│  │  │                          # MetricsGrid, VerifiedWhyCard, ForecastCards,
│  │  │                          # TrendChart, DeltaBadges, BioAnalytics,
│  │  │                          # BiodiversityCarousel
│  │  ├─ map/RadarMap.tsx        # MapLibre layers + route pins
│  │  ├─ routes/                 # RouteDrawer + RouteForm
│  │  ├─ score/                  # ScoreGauge + ExposureCard
│  │  └─ ui/                     # badge, button, card (shadcn-style)
│  ├─ lib/
│  │  ├─ ai/                     # personas.ts, prompt.ts, copilot.ts
│  │  ├─ services/               # openaq, openmeteo, nasafirms, gbif, wikipedia,
│  │  │                          # supabase, cache, http, apiAggregator
│  │  ├─ exposure.ts             # inhaled-dose & cigarette-equivalent engine
│  │  ├─ routing.ts              # OSRM fetch + AQI-grid route integration
│  │  ├─ forecast.ts             # +3/+6/+12h slice builder
│  │  ├─ export.ts               # JSON / CSV / PDF snapshot export
│  │  ├─ types.ts / utils.ts
│  └─ index.css                  # theme (glass panels, grid borders, glow)
├─ supabase/migrations/20260813000000_init.sql
├─ vite.config.ts                # dev proxies for /api
├─ .env.example, .vercel/, dist/, index.html
└─ package.json
```
