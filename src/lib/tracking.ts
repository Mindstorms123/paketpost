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

export async function fetchTracking(carrier: string, n: string, k: Keys): Promise<TrackResult> {
  const f = FETCHERS[carrier];
  const live = LIVE[carrier];
  if (!f || !live) throw new Error("Dieser Paketdienst bietet keinen öffentlichen Zugang.");
  if (live.fields.some((x) => !k[x])) throw new Error("Zugangsdaten fehlen – unter „Zugänge“ eintragen.");
  if (!isNative()) throw new Error("Live-Abruf funktioniert nur in der Android-App (der Browser blockiert direkte Anfragen).");
  return f(n, k);
}
