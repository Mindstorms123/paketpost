import { CapacitorHttp } from "@capacitor/core";

/** Version baked in at build time (CI sets VITE_APP_VERSION); "dev" when built locally. */
export const APP_VERSION: string = import.meta.env["VITE_APP_VERSION"] || "dev";

const RELEASES = "https://api.github.com/repos/Mindstorms123/paketpost/releases/latest";
export const RELEASE_PAGE = "https://github.com/Mindstorms123/paketpost/releases/latest";

/** true when version a is newer than b (dotted numbers, e.g. 1.0.12 > 1.0.9). */
export function isNewer(a: string, b: string): boolean {
  const pa = a.replace(/^v/, "").split(".").map(Number), pb = b.replace(/^v/, "").split(".").map(Number);
  if (pa.some(isNaN) || pb.some(isNaN)) return false;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** Asks GitHub only for the latest version number – no parcel data is sent. */
export async function checkUpdate(): Promise<{ latest: string; apk: string } | null> {
  const r = await CapacitorHttp.request({ method: "GET", url: RELEASES, headers: { Accept: "application/vnd.github+json" } });
  if (r.status >= 400) throw new Error(`GitHub antwortete mit Fehler ${r.status}`);
  const d = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
  const latest = String(d.tag_name ?? "").replace(/^v/, "");
  const apk = d.assets?.find((a: any) => a.name?.endsWith(".apk"))?.browser_download_url ?? RELEASE_PAGE;
  return latest && (APP_VERSION === "dev" || isNewer(latest, APP_VERSION)) ? { latest, apk } : null;
}
