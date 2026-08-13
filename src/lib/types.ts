export type RiskLevel = "Low" | "Moderate" | "High" | "Severe";

export interface AirQuality {
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  o3: number | null;
  aqi: number | null;
  aqi_category: string;
  source: "openaq" | "open-meteo";
  stations: number;
}

export interface Microclimate {
  temperature_2m: number | null;
  relative_humidity_2m: number | null;
  wind_speed_10m: number | null;
  uv_index: number | null;
  precipitation_probability: number | null;
  apparent_temperature: number | null;
  weather_code: number | null;
  source: "openmeteo";
  hourly?: {
    time: string[];
    temperature_2m: (number | null)[];
    uv_index: (number | null)[];
    precipitation_probability: (number | null)[];
  };
}

export interface FireHotspot {
  lat: number;
  lon: number;
  frp: number;
  acq_date: string;
  acq_time: string;
  confidence: number | null;
  satellite: string;
}

export interface SpeciesObservation {
  scientificName: string;
  commonName?: string;
  imageUrl?: string;
  gbifKey?: number;
  count: number;
}

/** Hourly AQI forecast point (+ optional forecast temperature). */
export interface AqiForecastPoint {
  time: string;
  us_aqi: number | null;
  pm25: number | null;
}

/** Historical baselines for delta comparison. */
export interface HistoryDelta {
  aqi_yesterday_avg: number | null;
  temp_avg_30d: number | null;
  humidity_avg_30d: number | null;
}

export interface TaxonGroup {
  label: string;
  count: number;
}

export interface BioIndicators {
  present: boolean;
  bees: number;
  butterflies: number;
  amphibians: number;
  total_sensitive: number;
}

export interface AggregatePayload {
  location: { lat: number; lon: number; name?: string };
  fetched_at: string;
  air_quality: AirQuality;
  microclimate: Microclimate;
  fire_hotspots: FireHotspot[];
  biodiversity: SpeciesObservation[];
  total_occurrences: number;
  /** Forward forecast: hourly us_aqi (+pm2.5) from Open-Meteo AQ model. */
  aqi_forecast: AqiForecastPoint[];
  /** Historical baselines for delta badges. */
  history: HistoryDelta;
  /** Taxonomic + bio-indicator breakdown of local biodiversity. */
  taxonomy: { groups: TaxonGroup[]; indicators: BioIndicators };
}

export interface PersonaScore {
  persona_health_score: number;
  risk_level: RiskLevel;
  headline: string;
  primary_factor: string;
  verified_why: string;
  actionable_advice: string[];
  forecast_summary: string;
}

/** Administrative hierarchy for the breadcrumb spatial navigation. */
export interface GeoHierarchy {
  country?: string;
  admin1?: string;
  city?: string;
  locality?: string;
  neighbourhood?: string;
}

export interface SearchLocation extends GeoHierarchy {
  lat: number;
  lon: number;
  name: string;
}

/** Alert rule configured by the user. */
export interface AlertRule {
  id: string;
  metric: AlertMetricKey;
  threshold: number;
  direction: "above" | "below";
  enabled: boolean;
  email?: string;
  createdAt: string;
}

export type AlertMetricKey =
  | "aqi"
  | "pm25"
  | "pm10"
  | "uv"
  | "temperature"
  | "humidity"
  | "rain"
  | "fire_count";

export interface AlertState extends AlertRule {
  value: number | null;
  triggered: boolean;
  lastTriggeredAt?: string;
}
