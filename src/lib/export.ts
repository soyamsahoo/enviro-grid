import { jsPDF } from "jspdf";
import type { AggregatePayload, BioIndicators, TaxonGroup } from "@/lib/types";

// ---------------------------------------------------------------------------
// Export context — everything visible in the dashboard snapshot can travel
// ---------------------------------------------------------------------------

export interface ExportContext {
  persona: string;
  routes?: {
    ventilationLabel?: string;
    activityMinutes?: number;
    mode?: string;
    routeA?: { label: string; minutes: number; pm25: number; massUg: number; cigarettes: number };
    routeB?: { label: string; minutes: number; pm25: number; massUg: number; cigarettes: number };
    routeD?: { label: string; minutes: number; pm25: number; massUg: number; cigarettes: number } | null;
    exposureReductionPct?: number;
    extraMinutes?: number;
  } | null;
  routeMeta?: { distanceKm: number; durationMin: number; avgPm25: number | null } | null;
  alerts?: string[];
}

interface ExportReport {
  meta: {
    exported_at: string;
    location: string;
    lat: number;
    lon: number;
    fetched_at: string;
    persona: string;
  };
  air_quality: {
    aqi: string | null;
    aqi_category: string;
    pm25: string | null;
    pm10: string | null;
    no2: string | null;
    o3: string | null;
    source: string;
    stations: number;
  };
  microclimate: {
    temperature_2m: string | null;
    apparent_temperature: string | null;
    relative_humidity_2m: string | null;
    wind_speed_10m: string | null;
    uv_index: string | null;
    precipitation_probability: string | null;
    weather_code: string | null;
  };
  forecast: Array<{ time: string; us_aqi: string | null; pm25: string | null }>;
  history: { aqi_yesterday_avg: string | null; temp_avg_30d: string | null; humidity_avg_30d: string | null };
  fires: Array<{
    lat: string;
    lon: string;
    frp: string;
    acq_date: string;
    acq_time: string;
    confidence: string;
    satellite: string;
  }>;
  species: Array<{ scientificName: string; commonName?: string; count: number }>;
  taxonomy: { groups: TaxonGroup[]; indicators: BioIndicators };
  total_occurrences: number;
  routes: NonNullable<ExportContext["routes"]> | null;
  routeMeta: NonNullable<ExportContext["routeMeta"]> | null;
  alerts: string[];
}

const n = (v: number | null | undefined) => (v === null || v === undefined ? null : String(v));

function buildReport(payload: AggregatePayload, name: string, ctx: ExportContext = { persona: "—" }): ExportReport {
  const aq = payload.air_quality;
  const mc = payload.microclimate;
  return {
    meta: {
      exported_at: new Date().toISOString(),
      location: name,
      lat: payload.location.lat,
      lon: payload.location.lon,
      fetched_at: payload.fetched_at,
      persona: ctx.persona,
    },
    air_quality: {
      aqi: n(aq.aqi),
      aqi_category: aq.aqi_category,
      pm25: n(aq.pm25),
      pm10: n(aq.pm10),
      no2: n(aq.no2),
      o3: n(aq.o3),
      source: aq.source,
      stations: aq.stations,
    },
    microclimate: {
      temperature_2m: n(mc.temperature_2m),
      apparent_temperature: n(mc.apparent_temperature),
      relative_humidity_2m: n(mc.relative_humidity_2m),
      wind_speed_10m: n(mc.wind_speed_10m),
      uv_index: n(mc.uv_index),
      precipitation_probability: n(mc.precipitation_probability),
      weather_code: n(mc.weather_code),
    },
    forecast: payload.aqi_forecast.map((p) => ({ time: p.time, us_aqi: n(p.us_aqi), pm25: n(p.pm25) })),
    history: {
      aqi_yesterday_avg: n(payload.history?.aqi_yesterday_avg),
      temp_avg_30d: n(payload.history?.temp_avg_30d),
      humidity_avg_30d: n(payload.history?.humidity_avg_30d),
    },
    fires: payload.fire_hotspots.map((f) => ({
      lat: f.lat.toFixed(4),
      lon: f.lon.toFixed(4),
      frp: n(Math.round(f.frp * 100) / 100) ?? "",
      acq_date: f.acq_date,
      acq_time: f.acq_time,
      confidence: n(f.confidence) ?? "",
      satellite: f.satellite,
    })),
    species: payload.biodiversity.map((s) => ({
      scientificName: s.scientificName,
      commonName: s.commonName,
      count: s.count,
    })),
    taxonomy: payload.taxonomy,
    total_occurrences: payload.total_occurrences,
    routes: ctx.routes ?? null,
    routeMeta: ctx.routeMeta ?? null,
    alerts: ctx.alerts ?? [],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function slugify(name: string) {
  return (
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) ||
    "location"
  );
}

function csvCell(c: string): string {
  return `"${c.replace(/"/g, '""')}"`;
}

function csvRows(header: string[], rows: string[][]): string {
  const out = [csvCell(header[0]) !== "" ? header.map(csvCell).join(",") : ""].filter((l) => l !== "");
  out.push(...rows.map((r) => r.map(csvCell).join(",")));
  return out.join("\r\n");
}

// ---------------------------------------------------------------------------
// 1) JSON — complete report + raw payload
// ---------------------------------------------------------------------------

export function exportSnapshotJSON(
  payload: AggregatePayload,
  locationName: string,
  ctx?: ExportContext,
) {
  const report = buildReport(payload, locationName, ctx);
  downloadBlob(
    JSON.stringify({ ...report, raw_payload: payload }, null, 2),
    `envirogrid-${slugify(locationName)}.json`,
    "application/json",
  );
}

// ---------------------------------------------------------------------------
// 2) CSV — sectioned flat-file for spreadsheets/analytics
// ---------------------------------------------------------------------------

export function exportSnapshotCSV(payload: AggregatePayload, locationName: string, ctx?: ExportContext) {
  const report = buildReport(payload, locationName, ctx);
  const sections: string[] = [];

  sections.push(csvRows(["metric", "value", "unit", "source"], [
    ["location", report.meta.location, "", ""],
    ["lat", String(report.meta.lat), "", ""],
    ["lon", String(report.meta.lon), "", ""],
    ["persona", report.meta.persona, "", ""],
    ["fetched_at", report.meta.fetched_at, "", ""],
    ["aqi", report.air_quality.aqi ?? "", "US AQI", report.air_quality.source],
    ["aqi_category", report.air_quality.aqi_category, "", report.air_quality.source],
    ["pm25", report.air_quality.pm25 ?? "", "µg/m³", report.air_quality.source],
    ["pm10", report.air_quality.pm10 ?? "", "µg/m³", report.air_quality.source],
    ["no2", report.air_quality.no2 ?? "", "ppb", report.air_quality.source],
    ["o3", report.air_quality.o3 ?? "", "ppb", report.air_quality.source],
    ["stations", String(report.air_quality.stations), "", report.air_quality.source],
    ["temperature", report.microclimate.temperature_2m ?? "", "°C", "openmeteo"],
    ["apparent_temperature", report.microclimate.apparent_temperature ?? "", "°C", "openmeteo"],
    ["humidity", report.microclimate.relative_humidity_2m ?? "", "%", "openmeteo"],
    ["wind_speed", report.microclimate.wind_speed_10m ?? "", "km/h", "openmeteo"],
    ["uv_index", report.microclimate.uv_index ?? "", "", "openmeteo"],
    ["precipitation_probability", report.microclimate.precipitation_probability ?? "", "%", "openmeteo"],
    ["weather_code", report.microclimate.weather_code ?? "", "", "openmeteo"],
    ["aqi_yesterday", report.history.aqi_yesterday_avg ?? "", "US AQI", "Open-Meteo archive"],
    ["temp_avg_30d", report.history.temp_avg_30d ?? "", "°C", "Open-Meteo archive"],
    ["humidity_avg_30d", report.history.humidity_avg_30d ?? "", "%", "Open-Meteo archive"],
    ["fire_hotspots", String(report.fires.length), "count", "FIRMS"],
    ["species_observed", String(report.total_occurrences), "count", "GBIF"],
  ]));

  sections.push(csvRows(["time", "us_aqi", "pm25_ug_per_m3"], report.forecast.map((f) => [f.time, f.us_aqi ?? "", f.pm25 ?? ""])));

  if (report.fires.length) {
    sections.push(csvRows(
      ["lat", "lon", "frp", "acq_date", "acq_time", "confidence", "satellite"],
      report.fires.map((f) => [f.lat, f.lon, f.frp ?? "", f.acq_date, f.acq_time, f.confidence ?? "", f.satellite]),
    ));
  }

  if (report.species.length) {
    sections.push(csvRows(
      ["scientific_name", "common_name", "sightings"],
      report.species.map((s) => [s.scientificName, s.commonName ?? "", String(s.count)]),
    ));
    sections.push(csvRows(
      ["group", "count"],
      report.taxonomy.groups.map((g) => [g.label, String(g.count)]),
    ));
    sections.push(csvRows(
      ["indicator", "count"],
      [
        ["bees", String(report.taxonomy.indicators.bees)],
        ["butterflies", String(report.taxonomy.indicators.butterflies)],
        ["amphibians", String(report.taxonomy.indicators.amphibians)],
        ["total_sensitive", String(report.taxonomy.indicators.total_sensitive)],
      ],
    ));
  }

  if (report.routes) {
    const r = report.routes;
    const row = (o?: { label: string; minutes: number; pm25: number; massUg: number; cigarettes: number }) =>
      o ? [o.label, String(o.minutes), String(o.pm25), String(Math.round(o.massUg * 100) / 100), String(Math.round(o.cigarettes * 100) / 100)] : [];
    sections.push(csvRows(
      ["route", "minutes", "pm25_ug_per_m3", "inhaled_pm25_ug", "cigarette_equivalents", "exposure_reduction_pct", "extra_minutes", "mode", "ventilation"],
      [
        [...row(r.routeA), "", "", r.mode ?? "fastest", r.ventilationLabel ?? ""],
        [...row(r.routeB), String(r.exposureReductionPct ?? ""), String(r.extraMinutes ?? ""), r.mode ?? "fastest", r.ventilationLabel ?? ""],
        ...(r.routeD ? [[...row(r.routeD), "", "", r.mode ?? "dangerous", r.ventilationLabel ?? ""]] : []),
      ],
    ));
  }

  if (report.alerts.length) {
    sections.push(csvRows(["alert"], report.alerts.map((a) => [a])));
  }

  downloadBlob(
    sections.join("\r\n\r\n"),
    `envirogrid-${slugify(locationName)}.csv`,
    "text/csv",
  );
}

// ---------------------------------------------------------------------------
// 3) PDF — dark themed, multi-page report
// ---------------------------------------------------------------------------

const GREEN: [number, number, number] = [16, 185, 129];
const CYAN: [number, number, number] = [34, 211, 238];
const INK: [number, number, number] = [6, 21, 30];
const PANEL: [number, number, number] = [15, 40, 48];
const TEXT: [number, number, number] = [203, 213, 225];
const MUTED: [number, number, number] = [100, 116, 139];

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 15;
const BODY_W = PAGE_W - MARGIN * 2;

export function exportSnapshotPDF(payload: AggregatePayload, locationName: string, ctx?: ExportContext) {
  const report = buildReport(payload, locationName, ctx);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let page = 1;
  let y = 60;

  const totalPages = () => doc.getNumberOfPages();
  const footer = () => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(
      `ENVIROGRID 2.0 snapshot · ${report.meta.location} · page ${doc.getCurrentPageInfo().pageNumber} of ${totalPages()}`,
      15,
      PAGE_H - 8,
    );
  };

  const sectionTitle = (title: string, color: [number, number, number] = GREEN) => {
    newPageIfNeeded(16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...color);
    doc.text(title.toUpperCase(), MARGIN, y);
    doc.setDrawColor(...color);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, y + 1.5, PAGE_W - MARGIN, y + 1.5);
    y += 7;
  };

  const newPageIfNeeded = (needed: number) => {
    if (y + needed > PAGE_H - 25) {
      footer();
      doc.addPage();
      page++;
      y = 20;
    }
  };

  const kvRow = (k: string, v: string) => {
    newPageIfNeeded(7);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...TEXT);
    doc.text(k, MARGIN, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(52, 211, 153);
    doc.text(v, MARGIN + 65, y);
    y += 6;
  };

  const kvTable = (rows: Array<[string, string]>) => {
    rows.forEach(([k, v]) => kvRow(k, v));
  };

  const table = (
    headers: string[],
    rows: string[][],
    widths: number[],
    rowHeight = 6,
  ) => {
    newPageIfNeeded(rowHeight * 2 + 8);
    // header
    doc.setFillColor(...PANEL);
    doc.rect(MARGIN, y - 4.5, BODY_W, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...GREEN);
    let x = MARGIN;
    headers.forEach((h, i) => {
      doc.text(h, x + 1.5, y - 1);
      x += widths[i];
    });
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    rows.forEach((r) => {
      newPageIfNeeded(rowHeight);
      if (y > PAGE_H - 25) return;
      x = MARGIN;
      r.forEach((c, i) => {
        doc.setTextColor(...TEXT);
        doc.text(String(c).slice(0, 30), x + 1.5, y);
        x += widths[i];
      });
      y += rowHeight;
    });
    y += 4;
  };

  // ---------------------------------------------------------------- cover
  doc.setFillColor(...INK);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");
  doc.setFillColor(16, 185, 129);
  doc.rect(0, 0, PAGE_W, 3, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(226, 232, 240);
  doc.text("ENVIROGRID", MARGIN, 30);
  doc.setTextColor(...GREEN);
  doc.text("SNAPSHOT", MARGIN + 52, 30);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...TEXT);
  doc.text(report.meta.location, MARGIN, 40);
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(
    `${report.meta.lat.toFixed(4)}, ${report.meta.lon.toFixed(4)} · fetched ${new Date(report.meta.fetched_at).toLocaleString()}`,
    MARGIN,
    45,
  );
  doc.text(`Persona: ${report.meta.persona}`, MARGIN, 50);

  y = 60;

  // ---------------------------------------------------------------- air
  sectionTitle("Air Quality", GREEN);
  kvTable([
    ["US AQI", `${report.air_quality.aqi ?? "n/a"} (${report.air_quality.aqi_category})`],
    ["PM2.5", report.air_quality.pm25 ? `${report.air_quality.pm25} µg/m³` : "n/a"],
    ["PM10", report.air_quality.pm10 ? `${report.air_quality.pm10} µg/m³` : "n/a"],
    ["NO₂", report.air_quality.no2 ? `${report.air_quality.no2} ppb` : "n/a"],
    ["O₃", report.air_quality.o3 ? `${report.air_quality.o3} ppb` : "n/a"],
    ["Source / stations", `${report.air_quality.source} · ${report.air_quality.stations}`],
  ]);
  y += 2;

  // ---------------------------------------------------------------- microclimate
  sectionTitle("Microclimate", CYAN);
  kvTable([
    ["Temperature", report.microclimate.temperature_2m ? `${report.microclimate.temperature_2m} °C` : "n/a"],
    ["Feels like", report.microclimate.apparent_temperature ? `${report.microclimate.apparent_temperature} °C` : "n/a"],
    ["Humidity", report.microclimate.relative_humidity_2m ? `${report.microclimate.relative_humidity_2m} %` : "n/a"],
    ["UV index", report.microclimate.uv_index ?? "n/a"],
    ["Wind", report.microclimate.wind_speed_10m ? `${report.microclimate.wind_speed_10m} km/h` : "n/a"],
    ["Rain probability", report.microclimate.precipitation_probability ? `${report.microclimate.precipitation_probability} %` : "n/a"],
  ]);
  y += 2;

  // ---------------------------------------------------------------- history
  sectionTitle("Historical Deltas", MUTED);
  kvTable([
    ["AQI yesterday", report.history.aqi_yesterday_avg ?? "n/a"],
    ["30-day mean temp", report.history.temp_avg_30d ? `${report.history.temp_avg_30d} °C` : "n/a"],
    ["30-day mean humidity", report.history.humidity_avg_30d ? `${report.history.humidity_avg_30d} %` : "n/a"],
  ]);
  y += 2;

  // ---------------------------------------------------------------- forecast
  if (report.forecast.length) {
    sectionTitle("AQI Forecast (next hours)", GREEN);
    table(
      ["Time", "US AQI", "PM2.5 (µg/m³)"],
      report.forecast.map((f) => [f.time, f.us_aqi ?? "—", f.pm25 ?? "—"]),
      [60, 55, 65],
    );
    y += 2;
  }

  // ---------------------------------------------------------------- fires
  sectionTitle("Active Fires (FIRMS)", [239, 68, 68]);
  if (report.fires.length) {
    table(
      ["Date", "Time", "Sat", "FRP", "Conf", "Lat", "Lon"],
      report.fires.map((f) => [f.acq_date, f.acq_time, f.satellite, f.frp ?? "—", f.confidence ?? "—", f.lat, f.lon]),
      [22, 14, 22, 15, 15, 24, 24],
    );
  } else {
    kvRow("None detected", "no FIRMS hotspots within range");
  }
  y += 2;

  // ---------------------------------------------------------------- biodiversity
  sectionTitle("Biodiversity (GBIF)", [52, 211, 153]);
  kvRow("Occurrences", String(report.total_occurrences));
  if (report.species.length) {
    table(
      ["Species", "Common name", "Sightings"],
      report.species.slice(0, 24).map((s) => [s.scientificName, s.commonName ?? "—", String(s.count)]),
      [70, 70, 40],
    );
  } else {
    kvRow("No species", "GBIF returned no records within range");
  }
  if (report.taxonomy.groups.length) {
    kvRow(
      "Taxonomy",
      report.taxonomy.groups.map((g) => `${g.label} (${g.count})`).join(", "),
    );
  }
  y += 2;

  // ---------------------------------------------------------------- routes
  if (report.routes) {
    const r = report.routes;
    sectionTitle("Route Dose Comparison", GREEN);
    if (report.routeMeta) {
      kvRow(
        "Live map route",
        `${report.routeMeta.distanceKm} km · ${Math.round(report.routeMeta.durationMin)} min · avg PM2.5 ${report.routeMeta.avgPm25 ? `${report.routeMeta.avgPm25} µg/m³` : "n/a"}`,
      );
    }
    kvRow("Mode / activity", `${r.mode ?? "fastest"} · ${r.ventilationLabel ?? "—"} · ${r.activityMinutes ?? 15} min`);
    const row = (o?: { label: string; minutes: number; pm25: number; massUg: number; cigarettes: number }) =>
      o ? `${o.label.replace(" route", "")} — ${o.minutes} min @ ${o.pm25} µg/m³ → ${o.cigarettes.toFixed(2)} cigarettes` : "";
    kvRow("Fastest", row(r.routeA));
    if (r.routeD) kvRow("Dangerous", row(r.routeD));
    kvRow("Cleanest", row(r.routeB));
    if (r.exposureReductionPct !== undefined) {
      kvRow("Saving", `cleanest corridor cuts dose by ${r.exposureReductionPct}% (+${r.extraMinutes} min)`);
    }
    y += 2;
  }

  // ---------------------------------------------------------------- alerts
  if (report.alerts.length) {
    sectionTitle("Triggered Alerts", [250, 204, 21]);
    kvTable(report.alerts.map((a, i) => [`Alert ${i + 1}`, a]));
  }

  // ---------------------------------------------------------------- sources
  sectionTitle("Sources", MUTED);
  kvTable([
    ["Air quality", report.air_quality.source === "openaq" ? "OpenAQ v3 (EPA AQI)" : "Open-Meteo AQ model"],
    ["Microclimate / forecast", "Open-Meteo"],
    ["Fires", "NASA FIRMS (VIIRS NRT)"],
    ["Biodiversity", "GBIF + Wikipedia"],
  ]);

  // footer on every page
  const count = doc.getNumberOfPages();
  for (let i = 1; i <= count; i++) {
    doc.setPage(i);
    footer();
  }

  doc.save(`envirogrid-${slugify(locationName)}.pdf`);
}

export function exportSnapshot(payload: AggregatePayload, locationName: string, format: "json" | "csv" | "pdf", ctx?: ExportContext) {
  if (format === "json") exportSnapshotJSON(payload, locationName, ctx);
  else if (format === "csv") exportSnapshotCSV(payload, locationName, ctx);
  else exportSnapshotPDF(payload, locationName, ctx);
}