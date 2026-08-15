/**
 * iOS-aware geolocation wrapper.
 *
 * iOS Safari specifics handled here:
 *  - `navigator.permissions.query({ name: "geolocation" })` is partially
 *    unsupported on iOS — we probe it inside try/catch and fall back to a
 *    direct permission-prompting call.
 *  - The permission prompt only appears for HTTPS + within a user gesture,
 *    so we never `await` anything before calling the geolocation APIs.
 *  - Embedded in-app browsers (Instagram/Facebook/LinkedIn WKWebView shells)
 *    frequently can't obtain a location fix at all — we detect them and
 *    tell the user to open Safari.
 *  - iOS is flaky on first fixes: we re-try with high accuracy + longer
 *    timeout before reporting failure.
 */

export type GeoResult =
  | { status: "ok"; lat: number; lon: number; accuracy: number | null }
  | { status: "denied"; message: string }
  | { status: "timeout"; message: string }
  | { status: "unsupported"; message: string }
  | { status: "error"; message: string };

export type GeoPermission = "granted" | "denied" | "prompt" | "unsupported";

/** True when running inside an iOS/Android in-app browser (WKWebView/WebView). */
export function isEmbeddedWebView(): boolean {
  const ua = navigator.userAgent;
  return /FBAN|FB_IAB|FBIOS|Instagram|LinkedInApp|MicroMessenger|Line\//i.test(ua)
    || /\(KHTML, like Gecko\).*(Mobile|iPhone|iPad).*wv/i.test(ua)
    || typeof (window as unknown as { webkit?: { messageHandlers?: unknown } }).webkit?.messageHandlers !== "undefined"
      && !(navigator as unknown as { standalone?: boolean }).standalone;
}

/** True on any iOS device (iPhone/iPad/iPod), useful for tailored guidance. */
export function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

/** Best-effort geolocation permission state; never throws. */
export async function getGeoPermission(): Promise<GeoPermission> {
  try {
    const perms = navigator.permissions as unknown as {
      query(opts: { name: string }): Promise<{ state: string }>;
    };
    const status = await perms.query({ name: "geolocation" });
    if (status.state === "granted") return "granted";
    if (status.state === "denied") return "denied";
    return "prompt";
  } catch {
    // iOS Safari (≤ 15.x) may throw "TypeError: Type error" for geolocation
    // permission queries — meaning "unknown, still promptable".
    return "unsupported";
  }
}

const permissionMessage = {
  denied:
    "Location access is blocked. On iPhone/iPad: open Settings → Safari → Location (or the aA/ⓘ button next to the address bar → settings for this website → Location → Allow). Then tap “Use my location” again.",
  embedded:
    "Location is unavailable inside in-app browsers (Instagram/Facebook/etc.). Tap the ⋯/share button and “Open in Safari”, then allow location there.",
} as const;

/**
 * Requests a position with an iOS-friendly strategy:
 *  1. checks permission state (best-effort) for clear "denied" guidance,
 *  2. makes a fast low-accuracy attempt,
 *  3. retries once with high accuracy + longer timeout,
 *  4. maps failure codes to actionable messages.
 * Must be called synchronously inside the user's tap so the iOS prompt shows.
 */
export function requestPosition(): Promise<GeoResult> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve({ status: "unsupported", message: "Geolocation isn't supported on this browser." });
      return;
    }
    if (isEmbeddedWebView()) {
      resolve({ status: "error", message: permissionMessage.embedded });
      return;
    }

    const finish = (result: GeoResult) => resolve(result);

    const attempt = (highAccuracy: boolean, timeoutMs: number) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          finish({
            status: "ok",
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null,
          });
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            finish({ status: "denied", message: permissionMessage.denied });
            return;
          }
          if (!highAccuracy) {
            // iOS first-fix flakiness → retry with high accuracy + longer wait.
            attempt(true, 20000);
            return;
          }
          finish({
            status: err.code === err.TIMEOUT ? "timeout" : "error",
            message:
              err.code === err.TIMEOUT
                ? "Location lookup timed out — usually caused by poor GPS reception. Move near a window or outdoors, then retry."
                : "Couldn't determine your position — retry, or search for a city instead.",
          });
        },
        { enableHighAccuracy: highAccuracy, timeout: timeoutMs, maximumAge: 60000 },
      );
    };

    // IMPORTANT: call synchronously in the user gesture so iOS shows the prompt.
    attempt(false, 15000);

    // If the probe confirms the site was denied in Settings, replace the
    // pending timeout with an actionable denial message.
    void getGeoPermission().then((s) => {
      if (s === "denied") {
        // give the synchronously-started attempt a moment to fail naturally first
        setTimeout(() => finish({ status: "denied", message: permissionMessage.denied }), 500);
      }
    });
  });
}