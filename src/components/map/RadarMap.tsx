import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { cn } from "@/lib/utils";
import type { AggregatePayload, SpeciesObservation } from "@/lib/types";
import { fetchJson } from "@/lib/services/http";
import { pollutantAQI, aqiColor } from "@/lib/services/openaq";

interface StationPoint {
  lat: number;
  lon: number;
  name: string;
  aqi: number | null;
  pm25: number | null;
}

interface LayerKey {
  aqi: boolean;
  fire: boolean;
  bio: boolean;
}

const STATION_API =
  "https://api.openaq.org/v3/locations?coordinates={lat},{lon}&radius=50000&limit=100&sort=distance";

interface OpenAQLocation {
  id: number;
  name?: string;
  geometry?: { coordinates?: [number, number] };
  parameters?: Array<{ name?: string; lastValue?: number | null }>;
}

export default function RadarMap({
  payload,
  center,
  className,
}: {
  payload: AggregatePayload | null;
  center: { lat: number; lon: number };
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  const [layers, setLayers] = useState<LayerKey>({ aqi: true, fire: true, bio: true });
  const [stations, setStations] = useState<StationPoint[]>([]);
  const [mapError, setMapError] = useState<string | null>(null);
  const [styleReady, setStyleReady] = useState(false);

  const key = import.meta.env.VITE_OPENAQ_API_KEY;

  // ---------------------------------------------------------------- init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          basemap: {
            type: "raster",
            tiles: [
              "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
              "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
            ],
            tileSize: 256,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
          },
        },
        layers: [{ id: "basemap", type: "raster", source: "basemap" }],
      },
      center: [center.lon, center.lat],
      zoom: 9,
      attributionControl: { compact: true },
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("error", (e) => setMapError(String(e.error?.message ?? "map error")));
    const onStyleLoaded = () => setStyleReady(true);
    map.on("load", onStyleLoaded);
    mapRef.current = map;

    return () => {
      map.off("load", onStyleLoaded);
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      setStyleReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----------------------------------------------------------- AQI stations
  useEffect(() => {
    if (!key) return;
    const url = STATION_API.replace("{lat}", String(center.lat)).replace(
      "{lon}",
      String(center.lon),
    );
    let cancelled = false;

    fetchJson<{ results?: OpenAQLocation[] }>(url, {
      headers: { "X-API-Key": key },
    })
      .then((data) => {
        if (cancelled) return;
        const points: StationPoint[] = [];
        for (const loc of data.results ?? []) {
          const [lon, lat] = loc.geometry?.coordinates ?? [NaN, NaN];
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

          const pm25 =
            loc.parameters?.find((p) => p.name === "pm25")?.lastValue ?? null;
          const pm10 =
            loc.parameters?.find((p) => p.name === "pm10")?.lastValue ?? null;
          const no2 =
            loc.parameters?.find((p) => p.name === "no2")?.lastValue ?? null;

          const subAqis = [pm25, pm10, no2]
            .map((v, i) =>
              v === null ? null : pollutantAQI(["pm25", "pm10", "no2"][i], v),
            )
            .filter((v): v is number => v !== null);

          points.push({
            lat,
            lon,
            name: loc.name ?? `Station ${loc.id}`,
            aqi: subAqis.length ? Math.max(...subAqis) : null,
            pm25,
          });
        }
        setStations(points);
      })
      .catch(() => {
        /* stations are decorative on the map */
      });

    return () => {
      cancelled = true;
    };
  }, [center.lat, center.lon, key]);

  // ------------------------------------------------------- derive geo sources
  const geojson = useMemo(() => {
    const fireFeatures = (payload?.fire_hotspots ?? []).map((f) => ({
      type: "Feature" as const,
      properties: { frp: f.frp, confidence: f.confidence, date: f.acq_date, time: f.acq_time },
      geometry: { type: "Point" as const, coordinates: [f.lon, f.lat] },
    }));

    const stationFeatures = stations.map((s) => ({
      type: "Feature" as const,
      properties: { name: s.name, aqi: s.aqi, pm25: s.pm25 },
      geometry: { type: "Point" as const, coordinates: [s.lon, s.lat] },
    }));

    const bioFeatures = (payload?.biodiversity ?? []).slice(0, 25).map((s, i) => ({
      type: "Feature" as const,
      properties: { name: s.scientificName, count: s.count, common: s.commonName ?? "" },
      geometry: {
        type: "Point" as const,
        coordinates: [
          center.lon + ((i % 5) - 2) * 0.02 + Math.random() * 0.005,
          center.lat + (Math.floor(i / 5) - 2) * 0.02 + Math.random() * 0.005,
        ],
      },
    }));

    return {
      fire: { type: "FeatureCollection" as const, features: fireFeatures },
      stations: { type: "FeatureCollection" as const, features: stationFeatures },
      bio: { type: "FeatureCollection" as const, features: bioFeatures },
    };
  }, [payload, stations, center]);

  // ------------------------------------------------------------- layer sync
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;

    if (!map.getLayer("center-ring")) {
      addBaseLayers(map, center);
    }

    applyVisibility(map, layers);
  }, [styleReady, layers, center, geojson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;

    syncSource(map, "fire-source", geojson.fire);
    syncSource(map, "station-source", geojson.stations);
    syncSource(map, "bio-source", geojson.bio);

    const fireCount = geojson.fire.features.length;
    const bounds = new maplibregl.LngLatBounds([center.lon, center.lat], [center.lon, center.lat]);
    for (const f of geojson.fire.features) bounds.extend(f.geometry.coordinates as [number, number]);
    for (const f of geojson.stations.features) bounds.extend(f.geometry.coordinates as [number, number]);

    map.fitBounds(bounds, { padding: 60, maxZoom: fireCount ? 10 : 11, duration: 700 });
  }, [styleReady, geojson, center]);

  function applyVisibility(map: MapLibreMap, vis: LayerKey) {
    const set = (id: string, on: boolean) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    };
    set("fire-pulse", vis.fire);
    set("fire-core", vis.fire);
    set("aqi-circle", vis.aqi);
    set("aqi-outline", vis.aqi);
    set("bio-cluster", vis.bio);
    set("bio-point", vis.bio);
    set("bio-label", vis.bio);
  }

  function addBaseLayers(map: MapLibreMap, center: { lat: number; lon: number }) {
    map.addSource("fire-source", { type: "geojson", data: geojson.fire });
    map.addSource("station-source", { type: "geojson", data: geojson.stations });
    map.addSource("bio-source", {
      type: "geojson",
      data: geojson.bio,
      cluster: true,
      clusterRadius: 45,
      clusterMaxZoom: 11,
    });

    // Center marker
    map.addSource("center-source", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: [center.lon, center.lat] },
          },
        ],
      },
    });
    map.addLayer({
      id: "center-ring",
      type: "circle",
      source: "center-source",
      paint: {
        "circle-radius": 16,
        "circle-color": "#22D3EE",
        "circle-opacity": 0.25,
      },
    });
    map.addLayer({
      id: "center-core",
      type: "circle",
      source: "center-source",
      paint: { "circle-radius": 5, "circle-color": "#22D3EE", "circle-opacity": 0.9 },
    });

    // Layer 1 — AQI stations
    map.addLayer({
      id: "aqi-outline",
      type: "circle",
      source: "station-source",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["get", "aqi"], 0, 10, 150, 18, 500, 26],
        "circle-color": ["get", "aqi"],
        "circle-opacity": 0.25,
        "circle-stroke-width": 2,
        "circle-stroke-color": ["get", "aqi"],
        "circle-stroke-opacity": 0.9,
      },
    });
    map.addLayer({
      id: "aqi-circle",
      type: "circle",
      source: "station-source",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["get", "aqi"], 0, 5, 150, 9, 500, 13],
        "circle-color": ["get", "aqi"],
        "circle-opacity": 0.75,
      },
    });

    // Layer 2 — Fire hotspots (pulsing rings + core)
    map.addLayer({
      id: "fire-pulse",
      type: "circle",
      source: "fire-source",
      paint: {
        "circle-radius": ["interpolate", ["exponential", 1.2], ["zoom"], 8, 8, 10, 20],
        "circle-color": "#EF4444",
        "circle-opacity": 0.28,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#F97316",
      },
    });
    map.addLayer({
      id: "fire-core",
      type: "circle",
      source: "fire-source",
      paint: {
        "circle-radius": ["interpolate", ["exponential", 1], ["zoom"], 8, 3, 10, 7],
        "circle-color": "#EF4444",
        "circle-opacity": 0.95,
      },
    });

    // Layer 3 — Biodiversity clusters
    map.addLayer({
      id: "bio-cluster",
      type: "circle",
      source: "bio-source",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#10B981",
        "circle-opacity": 0.85,
        "circle-radius": ["step", ["get", "point_count"], 14, 10, 20, 30, 26],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#A7F3D0",
      },
    });
    map.addLayer({
      id: "bio-label",
      type: "symbol",
      source: "bio-source",
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-size": 11,
      },
      paint: { "text-color": "#022C22", "text-opacity": 0.9 },
    });
    map.addLayer({
      id: "bio-point",
      type: "circle",
      source: "bio-source",
      filter: ["!", ["has", "point_count"]],
      paint: { "circle-radius": 6, "circle-color": "#34D399", "circle-opacity": 0.9 },
    });

    map.on("click", "bio-cluster", async (e) => {
      const source = map.getSource("bio-source") as GeoJSONSource;
      const feature = e.features?.[0];
      if (!feature || !feature.properties) return;
      const clusterId = feature.properties.cluster_id as number;
      if (feature.geometry.type !== "Point") return;
      const coords = feature.geometry.coordinates as [number, number];
      try {
        const zoom = await source.getClusterExpansionZoom(clusterId);
        map.easeTo({ center: coords, zoom });
      } catch {
        map.easeTo({ center: coords, zoom: 12 });
      }
    });

    const onClickPoint = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f || f.geometry.type !== "Point") return;
      const coords = f.geometry.coordinates as [number, number];
      return { f, coords };
    };

    map.on("click", "bio-point", (e) => {
      const hit = onClickPoint(e);
      if (!hit) return;
      const { f, coords } = hit;
      showPopup(
        map,
        coords,
        `<div class="text-slate-100 text-sm">${escapeHtml(String(f.properties?.common ?? f.properties?.name))}</div>
         <div class="text-slate-400 text-xs italic">${escapeHtml(String(f.properties?.name))}</div>
         <div class="text-emerald-400 text-xs mt-1">${f.properties?.count} sighting(s)</div>`,
      );
    });

    map.on("click", "aqi-circle", (e) => {
      const hit = onClickPoint(e);
      if (!hit) return;
      const { f, coords } = hit;
      const aqi = f.properties?.aqi;
      showPopup(
        map,
        coords,
        `<div class="text-slate-100 text-sm font-semibold">${escapeHtml(String(f.properties?.name))}</div>
         <div class="text-xs mt-1" style="color:${aqiColor(typeof aqi === "number" ? aqi : null)}">
           AQI ${aqi === null ? "n/a" : String(aqi)}
         </div>
         <div class="text-slate-400 text-xs">PM2.5: ${f.properties?.pm25 ?? "n/a"} µg/m³</div>`,
      );
    });

    map.on("click", "fire-core", (e) => {
      const hit = onClickPoint(e);
      if (!hit) return;
      const { f, coords } = hit;
      showPopup(
        map,
        coords,
        `<div class="text-red-400 text-sm font-semibold">Active Fire Hotspot</div>
         <div class="text-slate-300 text-xs">FRP: ${f.properties?.frp ?? "n/a"} MW · Confidence: ${f.properties?.confidence ?? "n/a"}</div>
         <div class="text-slate-400 text-xs">Detected ${escapeHtml(String(f.properties?.date))} ${escapeHtml(String(f.properties?.time ?? ""))} UTC</div>`,
      );
    });

    map.on("click", "center-ring", (e) => {
      const hit = onClickPoint(e);
      if (!hit) return;
      const { coords } = hit;
      const species = payloadRef.current?.biodiversity ?? [];
      const list = species
        .slice(0, 6)
        .map(speciesHtml)
        .join("");
      showPopup(
        map,
        coords,
        `<div class="text-cyan-300 text-sm font-semibold mb-1">Local Biodiversity</div>
         <div class="max-h-48 overflow-y-auto space-y-2">${list || '<div class="text-slate-400 text-xs">No species records found nearby</div>'}</div>`,
      );
    });

    map.on("mouseenter", ["aqi-circle", "fire-core", "bio-point", "bio-cluster"], () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", ["aqi-circle", "fire-core", "bio-point", "bio-cluster"], () => {
      map.getCanvas().style.cursor = "";
    });
  }

  function showPopup(map: MapLibreMap, coords: [number, number], html: string) {
    popupRef.current?.remove();
    const popup = new maplibregl.Popup({ offset: 14, maxWidth: "280px" })
      .setLngLat(coords)
      .setHTML(`<div class="bg-[#0E1420] border border-grid-border rounded-lg p-3">${html}</div>`)
      .addTo(map);
    popupRef.current = popup;
  }

  const toggleButton = (label: string, active: boolean, onClick: () => void, accent: string) => (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors",
        active
          ? "border-transparent bg-grid-panel text-white " + accent
          : "border-grid-border text-slate-500 hover:text-slate-300",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className={cn("relative h-full min-h-[420px] overflow-hidden rounded-xl border border-grid-border", className)}>
      <div ref={containerRef} className="absolute inset-0" />
      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-grid-bg/90 text-sm text-red-400">
          Map failed to load: {mapError}
        </div>
      )}
      <div className="absolute left-3 top-3 flex flex-wrap gap-2">
        {toggleButton("AQI Stations", layers.aqi, () => setLayers((l) => ({ ...l, aqi: !l.aqi })), "bg-emerald-500/20 text-emerald-300 border-emerald-500/40")}
        {toggleButton("Fire Hotspots", layers.fire, () => setLayers((l) => ({ ...l, fire: !l.fire })), "bg-red-500/20 text-red-300 border-red-500/40")}
        {toggleButton("Biodiversity", layers.bio, () => setLayers((l) => ({ ...l, bio: !l.bio })), "bg-cyan-500/20 text-cyan-300 border-cyan-500/40")}
      </div>
      <div className="absolute bottom-3 left-3 rounded-lg border border-grid-border bg-grid-bg/80 p-2.5 backdrop-blur">
        <div className="space-y-1 font-mono text-[10px] uppercase tracking-widest text-slate-400">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> GBIF species
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> NASA FIRMS fire
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" /> OpenAQ AQI
          </div>
        </div>
      </div>
    </div>
  );
}

function speciesHtml(s: SpeciesObservation): string {
  return `<div class="flex items-center gap-2">
    ${s.imageUrl ? `<img src="${escapeHtml(s.imageUrl)}" class="h-8 w-8 rounded-md object-cover" loading="lazy" />` : `<div class="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-xs">🌿</div>`}
    <div class="min-w-0">
      <div class="truncate text-xs font-semibold text-slate-100">${escapeHtml(s.commonName ?? s.scientificName)}</div>
      <div class="truncate text-[10px] italic text-slate-400">${escapeHtml(s.scientificName)} · ${s.count} sightings</div>
    </div>
  </div>`;
}

function syncSource(map: MapLibreMap, id: string, data: unknown) {
  if (!map.getSource(id)) return;
  (map.getSource(id) as GeoJSONSource).setData(data as GeoJSON.FeatureCollection);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
