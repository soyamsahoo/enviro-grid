import { useEffect, useMemo, useRef, useState } from "react";
import { Route } from "lucide-react";
import maplibregl, { type Map as MapLibreMap, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { cn, formatNumber } from "@/lib/utils";
import type { AggregatePayload, SpeciesObservation } from "@/lib/types";
import { fetchStationsWithLatest, aqiColor } from "@/lib/services/openaq";
import { fetchJson } from "@/lib/services/http";
import type { LatLng, RouteResult } from "@/lib/routing";

interface StationPoint {
  lat: number;
  lon: number;
  name: string;
  aqi: number | null;
  pm25: number | null;
}

interface LayerKey {
  sat: boolean;
  aqi: boolean;
  heat: boolean;
  fire: boolean;
  bio: boolean;
  quake: boolean;
}

const USGS_FEED = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson";

/** Keep only quakes near the search center to reduce visual noise. */
function quakesNear(
  fcs: GeoJSON.FeatureCollection,
  lat: number,
  lon: number,
  latSpan = 14,
  lonSpan = 20,
): GeoJSON.Feature<GeoJSON.Point>[] {
  return (fcs.features ?? []).filter((f): f is GeoJSON.Feature<GeoJSON.Point> => {
    if (f.geometry?.type !== "Point") return false;
    const c = f.geometry.coordinates;
    return (
      Math.abs(c[1] - lat) <= latSpan &&
      Math.abs(c[0] - lon) <= lonSpan
    );
  });
}

export default function RadarMap({
  payload,
  center,
  className,
  grid,
  origin,
  destination,
  onOriginChange,
  onDestinationChange,
  routeCoords,
  routeMeta,
  routeLoading,
}: {
  payload: AggregatePayload | null;
  center: { lat: number; lon: number };
  className?: string;
  grid?: Array<{ lat: number; lon: number; aqi: number | null }>;
  origin?: LatLng;
  destination?: LatLng;
  onOriginChange?: (p: LatLng) => void;
  onDestinationChange?: (p: LatLng) => void;
  routeCoords?: LatLng[];
  routeMeta?: RouteResult | null;
  routeLoading?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const originMarkerRef = useRef<maplibregl.Marker | null>(null);
  const destMarkerRef = useRef<maplibregl.Marker | null>(null);
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  const [layers, setLayers] = useState<LayerKey>({
    sat: false,
    aqi: true,
    heat: false,
    fire: true,
    bio: true,
    quake: true,
  });
  const [stations, setStations] = useState<StationPoint[]>([]);
  const [quakes, setQuakes] = useState<GeoJSON.Feature<GeoJSON.Point>[]>([]);
  const [mapError, setMapError] = useState<string | null>(null);
  const [styleReady, setStyleReady] = useState(false);

  // ---------------------------------------------------------------- init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
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
          satellite: {
            type: "raster",
            tiles: [
              "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            maxzoom: 19,
            attribution:
              "&copy; Esri, Maxar, Earthstar Geographics, GIS User Community",
          },
        },
        layers: [
          { id: "basemap", type: "raster", source: "basemap" },
          {
            id: "satellite",
            type: "raster",
            source: "satellite",
            layout: { visibility: "none" },
          },
        ],
      },
      center: [center.lon, center.lat],
      zoom: 9,
      attributionControl: { compact: true },
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    // Draggable route pins (origin = rose, destination = emerald).
    if (origin && destination) {
      originMarkerRef.current = createPinMarker(map, origin, true, (p) =>
        onOriginChange?.(p),
      );
      destMarkerRef.current = createPinMarker(map, destination, false, (p) =>
        onDestinationChange?.(p),
      );
    }
    // Non-fatal map errors (missing glyph/font ranges, tile 404s) are common
    // and must never take down the dashboard — only fatal style/source
    // failures surface in the UI.
    map.on("error", (e) => {
      const msg = String(e.error?.message ?? "");
      const isFatal = /(style|source|layer).*(not found|invalid|failed|error)/i.test(msg);
      if (isFatal) {
        setMapError(msg);
      } else {
        console.warn("MapLibre error suppressed:", e.error);
      }
    });
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
    if (!import.meta.env.VITE_OPENAQ_API_KEY) return;
    let cancelled = false;

    fetchStationsWithLatest(center.lat, center.lon)
      .then((points) => {
        if (cancelled) return;
        setStations(points);
      })
      .catch(() => {
        /* station dots are decorative; payload AQI still works */
      });

    return () => {
      cancelled = true;
    };
  }, [center.lat, center.lon]);

  // --------------------------------------------- reposition route pins
  useEffect(() => {
    originMarkerRef.current?.setLngLat([origin?.lon ?? 0, origin?.lat ?? 0]);
    destMarkerRef.current?.setLngLat([destination?.lon ?? 0, destination?.lat ?? 0]);
  }, [origin, destination]);

  // ------------------------------------------------------- earthquake events
  useEffect(() => {
    let cancelled = false;
    fetchJson<GeoJSON.FeatureCollection>(USGS_FEED)
      .then((fc) => {
        if (cancelled) return;
        setQuakes(quakesNear(fc, center.lat, center.lon));
      })
      .catch(() => {
        /* disasters layer is best-effort */
      });
    return () => {
      cancelled = true;
    };
  }, [center.lat, center.lon]);

  // --------------------------------------------- AQI grid fallback coverage
  // (grid lifted to Dashboard so the dose engine shares the same field)

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

    const gridFeatures = (grid ?? []).map((g) => ({
      type: "Feature" as const,
      properties: { aqi: g.aqi },
      geometry: { type: "Point" as const, coordinates: [g.lon, g.lat] },
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

    const quakeFeatures: GeoJSON.Feature[] = quakes.map((q) => ({
      type: "Feature",
      properties: {
        mag: (q.properties?.mag as number) ?? null,
        place: (q.properties?.place as string) ?? "Earthquake",
        time: (q.properties?.time as number) ?? null,
        tsunami: (q.properties?.tsunami as number) ?? 0,
      },
      geometry: q.geometry,
    }));

    return {
      fire: { type: "FeatureCollection" as const, features: fireFeatures },
      stations: { type: "FeatureCollection" as const, features: stationFeatures },
      grid: { type: "FeatureCollection" as const, features: gridFeatures },
      bio: { type: "FeatureCollection" as const, features: bioFeatures },
      quakes: { type: "FeatureCollection" as const, features: quakeFeatures },
      route: routeCoords && routeCoords.length >= 2
        ? ({
            type: "FeatureCollection" as const,
            features: [
              {
                type: "Feature" as const,
                properties: {},
                geometry: {
                  type: "LineString" as const,
                  coordinates: routeCoords.map((c) => [c.lon, c.lat] as [number, number]),
                },
              },
            ],
          } as GeoJSON.FeatureCollection)
        : ({ type: "FeatureCollection" as const, features: [] } as GeoJSON.FeatureCollection),
    };
  }, [payload, stations, grid, quakes, center, routeCoords]);

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
    syncSource(map, "grid-source", geojson.grid);
    syncSource(map, "bio-source", geojson.bio);
    syncSource(map, "quake-source", geojson.quakes);
    syncSource(map, "route-source", geojson.route);

    const fireCount = geojson.fire.features.length;
    const bounds = new maplibregl.LngLatBounds([center.lon, center.lat], [center.lon, center.lat]);
    for (const f of geojson.fire.features) bounds.extend(f.geometry.coordinates as [number, number]);
    for (const f of geojson.stations.features) bounds.extend(f.geometry.coordinates as [number, number]);
    for (const f of geojson.route.features) {
      const c = (f.geometry as GeoJSON.LineString).coordinates as [number, number][];
      c.forEach((coord) => bounds.extend(coord));
    }

    map.fitBounds(bounds, { padding: 60, maxZoom: fireCount ? 10 : 11, duration: 700 });
  }, [styleReady, geojson, center]);

  function applyVisibility(map: MapLibreMap, vis: LayerKey) {
    const set = (id: string, on: boolean) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    };
    set("basemap", !vis.sat);
    set("satellite", vis.sat);
    set("fire-pulse", vis.fire);
    set("fire-core", vis.fire);
    // Modeled AQI grid fills the map when physical stations are sparse.
    set("aqi-grid", vis.aqi && stations.length < 3);
    set("aqi-circle", vis.aqi);
    set("aqi-outline", vis.aqi);
    set("aqi-heat", vis.heat);
    set("bio-cluster", vis.bio);
    set("bio-point", vis.bio);
    set("bio-label", vis.bio);
    set("quake-ring", vis.quake);
    set("quake-core", vis.quake);
  }

  function addBaseLayers(map: MapLibreMap, center: { lat: number; lon: number }) {
    map.addSource("fire-source", { type: "geojson", data: geojson.fire });
    map.addSource("station-source", { type: "geojson", data: geojson.stations });
    map.addSource("grid-source", { type: "geojson", data: geojson.grid });
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
      id: "aqi-grid",
      type: "circle",
      source: "grid-source",
      layout: { visibility: "none" },
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 9, 11, 14],
        "circle-color": ["get", "aqi"],
        "circle-opacity": 0.4,
        "circle-stroke-width": 0.5,
        "circle-stroke-color": ["get", "aqi"],
        "circle-stroke-opacity": 0.5,
      },
    });
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

    // Layer 1b — Continuous AQI heatmap across station coverage
    map.addLayer({
      id: "aqi-heat",
      type: "heatmap",
      source: "station-source",
      layout: { visibility: "none" },
      paint: {
        "heatmap-weight": [
          "interpolate",
          ["linear"],
          ["get", "aqi"],
          0, 0,
          50, 0.25,
          100, 0.5,
          200, 0.8,
          500, 1,
        ],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 5, 24, 10, 60],
        "heatmap-opacity": 0.85,
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0, "rgba(10,30,20,0)",
          0.25, "rgba(16,185,129,0.55)",
          0.45, "rgba(245,158,11,0.6)",
          0.6, "rgba(249,115,22,0.7)",
          0.8, "rgba(239,68,68,0.85)",
          1, "rgba(127,29,29,0.95)",
        ],
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

    // Layer 4 — Disaster events (USGS earthquakes, 2.5+ / 24h)
    map.addSource("quake-source", { type: "geojson", data: geojson.quakes });
    map.addLayer({
      id: "quake-ring",
      type: "circle",
      source: "quake-source",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["get", "mag"], 2.5, 7, 5, 12, 8, 22],
        "circle-color": "rgba(167,139,250,0.35)",
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#A78BFA",
      },
    });
    map.addLayer({
      id: "quake-core",
      type: "circle",
      source: "quake-source",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["get", "mag"], 2.5, 3, 5, 5, 8, 9],
        "circle-color": "#8B5CF6",
        "circle-opacity": 0.9,
      },
    });

    map.on("click", "quake-ring", (e) => {
      const hit = onClickPoint(e);
      if (!hit) return;
      const { f, coords } = hit;
      const mag = f.properties?.mag ?? null;
      const time = f.properties?.time ? new Date(f.properties.time as number) : null;
      const tsunami = Number(f.properties?.tsunami) > 0;
      showPopup(
        map,
        coords,
        `<div class="text-violet-300 text-sm font-semibold">${escapeHtml(String(f.properties?.place))}</div>
         <div class="text-slate-300 text-xs">Magnitude <b>${mag === null ? "n/a" : String(Number(mag).toFixed(1))}</b>${tsunami ? " · <span class='text-red-400'>Tsunami alert</span>" : ""}</div>
         <div class="text-slate-400 text-xs">${time ? time.toLocaleString() : "time unknown"} · USGS feed</div>`,
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

    // Route line (live reroute between draggable pins)
    map.addSource("route-source", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: "route-glow",
      type: "line",
      source: "route-source",
      paint: { "line-color": "#10B981", "line-width": 8, "line-opacity": 0.22, "line-blur": 4 },
    });
    map.addLayer({
      id: "route-line",
      type: "line",
      source: "route-source",
      paint: { "line-color": "#34D399", "line-width": 3, "line-opacity": 0.95 },
    });

    map.on("mouseenter", ["aqi-circle", "fire-core", "bio-point", "bio-cluster", "quake-ring"], () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", ["aqi-circle", "fire-core", "bio-point", "bio-cluster", "quake-ring"], () => {
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
      <div className="absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2">
        {toggleButton("Satellite", layers.sat, () => setLayers((l) => ({ ...l, sat: !l.sat })), "bg-sky-500/20 text-sky-300 border-sky-500/40")}
        {toggleButton("AQI Heatmap", layers.heat, () => setLayers((l) => ({ ...l, heat: !l.heat })), "bg-emerald-500/20 text-emerald-300 border-emerald-500/40")}
        {toggleButton("AQI Stations", layers.aqi, () => setLayers((l) => ({ ...l, aqi: !l.aqi })), "bg-emerald-500/20 text-emerald-300 border-emerald-500/40")}
        {toggleButton("Fire", layers.fire, () => setLayers((l) => ({ ...l, fire: !l.fire })), "bg-red-500/20 text-red-300 border-red-500/40")}
        {toggleButton("Biodiversity", layers.bio, () => setLayers((l) => ({ ...l, bio: !l.bio })), "bg-cyan-500/20 text-cyan-300 border-cyan-500/40")}
        {toggleButton("Disasters", layers.quake, () => setLayers((l) => ({ ...l, quake: !l.quake })), "bg-violet-500/20 text-violet-300 border-violet-500/40")}
      </div>
      <div className="absolute right-3 top-3 rounded-lg border border-emerald-500/30 bg-grid-bg/85 px-3 py-2 backdrop-blur">
        {routeLoading ? (
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
            Rerouting…
          </div>
        ) : routeMeta ? (
          <div className="font-mono text-[10px] uppercase tracking-widest">
            <div className="flex items-center gap-2 text-emerald-300">
              <Route className="h-3 w-3" /> Route A · {formatNumber(routeMeta.distanceKm, 1)} km ·{" "}
              {Math.round(routeMeta.durationMin)} min
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> PM2.5{" "}
              {routeMeta.avgPm25 === null ? "n/a" : `${formatNumber(routeMeta.avgPm25, 1)} µg/m³`}
              <span className="text-slate-600">· drag pins</span>
            </div>
          </div>
        ) : null}
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
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-400" /> Modeled AQI grid
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-violet-400" /> USGS quakes
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-gradient-to-r from-emerald-500 via-amber-500 to-red-500" />{" "}
            AQI heat
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

function createPinMarker(
  map: MapLibreMap,
  pos: LatLng,
  isOrigin: boolean,
  onChange: (p: LatLng) => void,
): maplibregl.Marker {
  const el = document.createElement("div");
  el.className = isOrigin ? "route-pin route-pin--origin" : "route-pin route-pin--dest";
  el.innerHTML = `<span class="route-pin__dot"></span>`;
  const marker = new maplibregl.Marker({ element: el, anchor: "bottom", draggable: true })
    .setLngLat([pos.lon, pos.lat])
    .addTo(map);
  marker.on("dragend", () => {
    const ll = marker.getLngLat();
    onChange({ lat: ll.lat, lon: ll.lng });
  });
  return marker;
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
