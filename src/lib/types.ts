export type RiskLevel = "Low" | "Moderate" | "High" | "Severe";

export interface AirQuality {
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  o3: number | null;
  aqi: number | null;
  aqi_category: string;
  source: "openaq";
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

export interface AggregatePayload {
  location: { lat: number; lon: number; name?: string };
  fetched_at: string;
  air_quality: AirQuality;
  microclimate: Microclimate;
  fire_hotspots: FireHotspot[];
  biodiversity: SpeciesObservation[];
  total_occurrences: number;
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
