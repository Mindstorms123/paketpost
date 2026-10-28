import { Capacitor, CapacitorHttp } from "@capacitor/core";
import type { Status } from "./carriers";

export type TrackEvent = { at: string; text: string; place?: string };
export type TrackResult = { status: Status; events: TrackEvent[] };

export type Keys = {
  dhlKey?: string;
  upsId?: string; upsSecret?: string;
  fedexId?: string; fedexSecret?: string;
  uspsId?: string; uspsSecret?: string;
};

const KEYS = "paketpost.keys.v1";
export const loadKeys = (): Keys => { try { return JSON.parse(localStorage.getItem(KEYS) || "{}"); } catch { return {}; } };
export const saveKeys = (k: Keys) => localStorage.setItem(KEYS, JSON.stringify(k));

/** Which carriers can be fetched directly, and which access they need. */
export const LIVE: Record<string, { fields: (keyof Keys)[]; portal: string }> = {
  dhl: { fields: ["dhlKey"], portal: "https://developer.dhl.com" },
  post: { fields: ["dhlKey"], portal: "https://developer.dhl.com" },
  dhlexpress: { fields: ["dhlKey"], portal: "https://developer.dhl.com" },
  ups: { fields: ["upsId", "upsSecret"], portal: "https://developer.ups.com" },
  fedex: { fields: ["fedexId", "fedexSecret"], portal: "https://developer.fedex.com" },
  tnt: { fields: ["fedexId", "fedexSecret"], portal: "https://developer.fedex.com" },
  usps: { fields: ["uspsId", "uspsSecret"], portal: "https://developers.usps.com" },
};

export const isNative = () => Capacitor.isNativePlatform();

async function http(opts: { url: string; method?: string; headers?: Record<string, string>; data?: unknown }) {
  const r = await CapacitorHttp.request({ method: "GET", ...opts });
  if (r.status >= 400) throw new Error(`Paketdienst antwortete mit Fehler ${r.status}`);
  return typeof r.data === "string" ? JSON.parse(r.data) : r.data;
}

export function guessStatus(text: string): Status {
  const t = text.toLowerCase();
  if (/(zugestellt|delivered)(?! attempt)/.test(t) && !/out for|wird zugestellt|nicht zugestellt/.test(t)) return "Zugestellt";
  if (/out for delivery|in zustellung|zustellfahrzeug|wird heute zugestellt/.test(t)) return "In Zustellung";
  if (/exception|problem|fehlgeschlagen|nicht zugestellt|failed|returned|zurück/.test(t)) return "Problem";
  if (/label created|elektronisch angekündigt|pre-shipment|shipment information/.test(t)) return "Angekündigt";
  return "Unterwegs";
}

const basic = (a: string, b: string) => "Basic " + btoa(`${a}:${b}`);

async function dhl(n: string, k: Keys): Promise<TrackResult> {
  const d = await http({ url: `https://api-eu.dhl.com/track/shipments?trackingNumber=${encodeURIComponent(n)}&language=de`, headers: { "DHL-API-Key": k.dhlKey! } });
  const s = d.shipments?.[0];
  if (!s) throw new Error("Sendung nicht gefunden");
  const map: Record<string, Status> = { "pre-transit": "Angekündigt", transit: "Unterwegs", delivered: "Zugestellt", failure: "Problem" };
  const events = (s.events ?? []).map((e: any) => ({ at: e.timestamp, text: e.description || e.status, place: e.location?.address?.addressLocality }));
  return { status: map[s.status?.statusCode] ?? guessStatus(s.status?.description ?? ""), events };
}

async function ups(n: string, k: Keys): Promise<TrackResult> {
  const tok = await http({ url: "https://onlinetools.ups.com/security/v1/oauth/token", method: "POST", headers: { Authorization: basic(k.upsId!, k.upsSecret!), "Content-Type": "application/x-www-form-urlencoded" }, data: "grant_type=client_credentials" });
  const d = await http({ url: `https://onlinetools.ups.com/api/track/v1/details/${encodeURIComponent(n)}`, headers: { Authorization: `Bearer ${tok.access_token}`, transId: String(Date.now()), transactionSrc: "paketpost" } });
  const acts = d.trackResponse?.shipment?.[0]?.package?.[0]?.activity ?? [];
  const events = acts.map((a: any) => ({
    at: `${a.date?.slice(0, 4)}-${a.date?.slice(4, 6)}-${a.date?.slice(6, 8)}T${a.time?.slice(0, 2)}:${a.time?.slice(2, 4)}:00`,
    text: a.status?.description ?? "", place: a.location?.address?.city,
  }));
  return { status: guessStatus(events[0]?.text ?? ""), events };
}

async function fedex(n: string, k: Keys): Promise<TrackResult> {
  const tok = await http({ url: "https://apis.fedex.com/oauth/token", method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, data: `grant_type=client_credentials&client_id=${encodeURIComponent(k.fedexId!)}&client_secret=${encodeURIComponent(k.fedexSecret!)}` });
  const d = await http({ url: "https://apis.fedex.com/track/v1/trackingnumbers", method: "POST", headers: { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json" }, data: { includeDetailedScans: true, trackingInfo: [{ trackingNumberInfo: { trackingNumber: n } }] } });
  const r = d.output?.completeTrackResults?.[0]?.trackResults?.[0];
  const events = (r?.scanEvents ?? []).map((e: any) => ({ at: e.date, text: e.eventDescription, place: e.scanLocation?.city }));
  return { status: guessStatus(r?.latestStatusDetail?.description ?? events[0]?.text ?? ""), events };
}

async function usps(n: string, k: Keys): Promise<TrackResult> {
  const tok = await http({ url: "https://apis.usps.com/oauth2/v3/token", method: "POST", headers: { "Content-Type": "application/json" }, data: { grant_type: "client_credentials", client_id: k.uspsId, client_secret: k.uspsSecret } });
  const d = await http({ url: `https://apis.usps.com/tracking/v3/tracking/${encodeURIComponent(n)}?expand=DETAIL`, headers: { Authorization: `Bearer ${tok.access_token}` } });
  const events = (d.trackingEvents ?? []).map((e: any) => ({ at: e.eventTimestamp, text: e.eventType, place: e.eventCity }));
  return { status: guessStatus(d.statusCategory ?? events[0]?.text ?? ""), events };
}

const FETCHERS: Record<string, (n: string, k: Keys) => Promise<TrackResult>> = {
  dhl, post: dhl, dhlexpress: dhl, ups, fedex, tnt: fedex, usps,
};

const UA = { "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36", Accept: "application/json" };

/** Reads the same public data the carrier's own tracking page loads – no key needed. */
async function dhlPublic(n: string, zip?: string): Promise<TrackResult> {
  const z = zip ? `&zip=${encodeURIComponent(zip)}&inputSearch=true` : "";
  const d = await http({ url: `https://www.dhl.de/int-verfolgen/data/search?piececode=${encodeURIComponent(n)}&language=de${z}`, headers: UA });
  const v = d.sendungen?.[0]?.sendungsdetails?.sendungsverlauf;
  if (!v) throw new Error("Sendung nicht gefunden");
  const events = (v.events ?? []).map((e: any) => ({ at: e.datum, text: e.status ?? e.ruecksendung ?? "", place: e.ort })).reverse();
  return { status: guessStatus(v.kurzStatus ?? v.aktuellerStatus ?? events[0]?.text ?? ""), events };
}

const DPD_STEPS = ["Start", "OnTheRoad", "DeliveryDepot", "CarLoad", "Delivered"];

/** Reads the 5-step progress from DPD's public parcel page (my.dpd.de), newest step first. */
export function parseDpdHtml(html: string, now = new Date()): TrackResult | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const txt = (id: string) => doc.getElementById(`ContentPlaceHolder1_${id}`)?.textContent?.trim() ?? "";
  const current = txt("repParcelList_labDeliveryStatus_0");
  const withYear = (d: string) => {
    const m = d.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})?$/);
    if (!m) return d;
    const day = m[1] ?? "", mon = m[2] ?? "", yr = m[3];
    let y = yr ? +yr : now.getFullYear();
    // A step date far in the future belongs to last year (e.g. December parcel viewed in January).
    if (!yr && new Date(y, +mon - 1, +day).getTime() > now.getTime() + 7 * 864e5) y--;
    return `${day.padStart(2, "0")}.${mon.padStart(2, "0")}.${y}`;
  };
  const events = DPD_STEPS
    .map((s) => ({ text: txt(`labStatus${s}`), at: withYear(txt(`labStatus${s}Date`)) }))
    .filter((e) => e.text && e.at)
    .reverse();
  if (!events.length && !current) return null;
  return { status: guessStatus(current || events[0]?.text || ""), events };
}

/** DPD's old JSON address is gone; the public page needs its session cookie (kept by the native HTTP layer). */
async function dpdPublic(n: string): Promise<TrackResult> {
  const get = async (url: string) => {
    const r = await CapacitorHttp.request({ method: "GET", url, headers: { ...UA, Accept: "text/html" }, responseType: "text" });
    if (r.status >= 400) throw new Error(`Paketdienst antwortete mit Fehler ${r.status}`);
    return typeof r.data === "string" ? r.data : String(r.data ?? "");
  };
  const q = encodeURIComponent(n);
  let r = parseDpdHtml(await get(`https://my.dpd.de/redirect.aspx?action=12&parcelno=${q}`));
  // Second try once the session cookie is set.
  if (!r) r = parseDpdHtml(await get(`https://my.dpd.de/myParcel-tracking.aspx?parcelno=${q}`));
  if (!r) throw new Error("DPD kennt diese Sendung (noch) nicht.");
  return r;
}

async function glsPublic(n: string): Promise<TrackResult> {
  const d = await http({ url: `https://gls-group.com/app/service/open/rest/DE/de/rstt001?match=${encodeURIComponent(n)}`, headers: UA });
  const t = d.tuStatus?.[0];
  if (!t) throw new Error("Sendung nicht gefunden");
  const events = (t.history ?? []).map((h: any) => ({ at: `${h.date}T${h.time ?? "00:00:00"}`, text: h.evtDscr, place: h.address?.city }));
  return { status: guessStatus(t.progressBar?.statusInfo === "DELIVERED" ? "delivered" : events[0]?.text ?? ""), events };
}

const PUBLIC: Record<string, (n: string, zip?: string) => Promise<TrackResult>> = {
  dhl: dhlPublic, post: dhlPublic, dpd: dpdPublic, gls: glsPublic,
};

/** Carriers the app can refresh itself (without or with optional keys). */
export const canRefresh = (carrier: string) => carrier in PUBLIC || carrier in FETCHERS;
export const needsZip = (carrier: string) => carrier === "dhl" || carrier === "post" || carrier === "dpd";

export async function fetchTracking(carrier: string, n: string, k: Keys, zip?: string): Promise<TrackResult> {
  if (!canRefresh(carrier)) throw new Error("Dieser Paketdienst lässt sich nur über den Link abrufen.");
  if (!isNative()) throw new Error("Live-Abruf funktioniert nur in der Android-App (der Browser blockiert direkte Anfragen).");
  const live = LIVE[carrier];
  const hasKeys = live && live.fields.every((x) => k[x]);
  if (hasKeys) return FETCHERS[carrier]!(n, k);
  const pub = PUBLIC[carrier];
  if (pub) {
    try { return await pub(n, zip); }
    catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (/kennt|nicht gefunden/.test(m)) throw e;
      throw new Error("Der Paketdienst hat die Abfrage abgelehnt. Bitte den Link nutzen.");
    }
  }
  throw new Error("Für diesen Dienst ist ein eigener Zugang nötig (optional unter „Zugänge“).");
}
