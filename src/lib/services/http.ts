const API_TIMEOUT_MS = 12000;

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  return (await rawFetch(url, init)) as T;
}

/** Fetch raw text (e.g. NASA FIRMS CSV payloads). */
export async function fetchText(url: string, init?: RequestInit): Promise<string> {
  return rawFetch(url, init, "text");
}

async function rawFetch(url: string, init?: RequestInit, as: "json" | "text" = "json") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": "ENVIROGRID/2.0 (environmental intelligence platform)",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText} @ ${shortenUrl(url)}`);
    }
    return as === "text" ? res.text() : res.json();
  } finally {
    clearTimeout(timer);
  }
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return url.slice(0, 80);
  }
}
