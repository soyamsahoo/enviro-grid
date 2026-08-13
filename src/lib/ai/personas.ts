export type PersonaId =
  | "athlete"
  | "respiratory_patient"
  | "construction_worker"
  | "farmer"
  | "general_citizen";

export interface PersonaProfile {
  id: PersonaId;
  label: string;
  shortLabel: string;
  description: string;
  weights: {
    pm25: number;
    pm10: number;
    aqi: number;
    heatIndex: number;
    humidity: number;
    uv: number;
    rain: number;
    temperature: number;
    fire: number;
    biodiversity: number;
  };
}

/** Persona weighting profiles (spec §Module 3). */
export const PERSONA_PROFILES: Record<PersonaId, PersonaProfile> = {
  athlete: {
    id: "athlete",
    label: "Athlete",
    shortLabel: "Athlete",
    description: "Outdoor training, endurance & performance",
    weights: {
      pm25: 0.45, pm10: 0, aqi: 0, heatIndex: 0.25, humidity: 0.1,
      uv: 0.1, rain: 0.1, temperature: 0, fire: 0, biodiversity: 0,
    },
  },
  respiratory_patient: {
    id: "respiratory_patient",
    label: "Respiratory Patient",
    shortLabel: "Respiratory",
    description: "Asthma, COPD & sensitive lungs",
    weights: {
      pm25: 0.4, pm10: 0.2, aqi: 0.25, heatIndex: 0, humidity: 0.15,
      uv: 0, rain: 0, temperature: 0, fire: 0, biodiversity: 0,
    },
  },
  construction_worker: {
    id: "construction_worker",
    label: "Outdoor Worker",
    shortLabel: "Worker",
    description: "Construction & outdoor labor shifts",
    weights: {
      pm25: 0.1, pm10: 0.1, aqi: 0.2, heatIndex: 0.4, humidity: 0,
      uv: 0.3, rain: 0.1, temperature: 0, fire: 0, biodiversity: 0,
    },
  },
  farmer: {
    id: "farmer",
    label: "Farmer",
    shortLabel: "Farmer",
    description: "Crops, livestock & fieldwork",
    weights: {
      pm25: 0.05, pm10: 0.05, aqi: 0.1, heatIndex: 0.2, humidity: 0.2,
      uv: 0, rain: 0.3, temperature: 0.1, fire: 0, biodiversity: 0.2,
    },
  },
  general_citizen: {
    id: "general_citizen",
    label: "General Citizen",
    shortLabel: "Citizen",
    description: "Daily urban living baseline",
    weights: {
      pm25: 0.1, pm10: 0.05, aqi: 0.25, heatIndex: 0.25, humidity: 0.15,
      uv: 0.1, rain: 0.05, temperature: 0.1, fire: 0.1, biodiversity: 0,
    },
  },
};

export const PERSONA_IDS = Object.keys(PERSONA_PROFILES) as PersonaId[];

export const PERSONA_WEIGHT_MATRIX: Record<
  PersonaId,
  [string, number][]
> = Object.fromEntries(
  PERSONA_IDS.map((id) => [id, Object.entries(PERSONA_PROFILES[id].weights)]),
) as Record<PersonaId, [string, number][]>;

export { PERSONA_PROFILES as DEFAULT_PERSONA_PROFILES };
