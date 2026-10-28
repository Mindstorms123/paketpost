export type Carrier = {
  id: string;
  name: string;
  url: (n: string) => string;
  detect?: RegExp;
};

const e = encodeURIComponent;

export const CARRIERS: Carrier[] = [
  { id: "dhl", name: "DHL Paket", url: (n) => `https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=${e(n)}`, detect: /^(00340\d{15}|JJD\d{15,20}|\d{12}|\d{20}|JVGL\d{10,})$/i },
  { id: "post", name: "Deutsche Post", url: (n) => `https://www.deutschepost.de/de/s/sendungsverfolgung.html?piececode=${e(n)}`, detect: /^[A-Z]{2}\d{9}DE$/i },
  { id: "dhlexpress", name: "DHL Express", url: (n) => `https://www.dhl.com/de-de/home/tracking.html?tracking-id=${e(n)}`, detect: /^\d{10}$/ },
  { id: "hermes", name: "Hermes", url: (n) => `https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsinformation#${e(n)}`, detect: /^(H\d{19}|\d{14}|\d{16})$/i },
  { id: "dpd", name: "DPD", url: (n) => `https://tracking.dpd.de/status/de_DE/parcel/${e(n)}`, detect: /^(0\d{13}|\d{14}|\d{28})$/ },
  { id: "gls", name: "GLS", url: (n) => `https://gls-group.com/DE/de/paketverfolgung?match=${e(n)}`, detect: /^(\d{11}|[A-Z0-9]{8})$/i },
  { id: "ups", name: "UPS", url: (n) => `https://www.ups.com/track?loc=de_DE&tracknum=${e(n)}`, detect: /^1Z[0-9A-Z]{16}$/i },
  { id: "fedex", name: "FedEx", url: (n) => `https://www.fedex.com/fedextrack/?trknbr=${e(n)}`, detect: /^(\d{12}|\d{15})$/ },
  { id: "amazon", name: "Amazon Logistics", url: () => `https://www.amazon.de/gp/your-account/order-history`, detect: /^(TBA|DE)\d{9,}$/i },
  { id: "tnt", name: "TNT", url: (n) => `https://www.tnt.com/express/de_de/site/shipping-tools/tracking.html?cons=${e(n)}`, detect: /^GE\d{9}WW$/i },
  { id: "usps", name: "USPS", url: (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${e(n)}`, detect: /^(9[2-5]\d{20}|[A-Z]{2}\d{9}US)$/i },
  { id: "atpost", name: "Österreichische Post", url: (n) => `https://www.post.at/s/sendungssuche?snr=${e(n)}`, detect: /^[A-Z]{2}\d{9}AT$/i },
  { id: "chpost", name: "Die Schweizerische Post", url: (n) => `https://service.post.ch/ekp-web/ui/entry/search/${e(n)}`, detect: /^[A-Z]{2}\d{9}CH$/i },
  { id: "postnl", name: "PostNL", url: (n) => `https://jouw.postnl.nl/track-and-trace/${e(n)}`, detect: /^3S[A-Z0-9]{11,}$/i },
  { id: "royalmail", name: "Royal Mail", url: (n) => `https://www.royalmail.com/track-your-item#/tracking-results/${e(n)}`, detect: /^[A-Z]{2}\d{9}GB$/i },
  { id: "cainiao", name: "Cainiao / AliExpress", url: (n) => `https://global.cainiao.com/newDetail.htm?mailNoList=${e(n)}`, detect: /^(LP\d{14}|[A-Z]{2}\d{9}CN)$/i },
  { id: "goexpress", name: "GO! Express", url: (n) => `https://www.general-overnight.com/deu_de/sendungsverfolgung.html?reference=${e(n)}` },
  { id: "parcelone", name: "Parcel.One", url: (n) => `https://tracking.parcel.one/?trackingNumber=${e(n)}` },
];

export const byId = (id: string): Carrier => CARRIERS.find((c) => c.id === id) ?? CARRIERS[0]!;

export function detectCarrier(raw: string): string | null {
  const n = raw.replace(/\s+/g, "").toUpperCase();
  if (!n) return null;
  return CARRIERS.find((c) => c.detect?.test(n))?.id ?? null;
}

export const STATUSES = ["Angekündigt", "Unterwegs", "In Zustellung", "Zugestellt", "Problem"] as const;
export type Status = (typeof STATUSES)[number];

export type Parcel = {
  id: string;
  number: string;
  carrier: string;
  label: string;
  status: Status;
  history: { status: Status; at: number; note?: string }[];
  createdAt: number;
  events?: { at: string; text: string; place?: string }[];
  checkedAt?: number;
  zip?: string | undefined;
};

const KEY = "paketpost.parcels.v1";
export const load = (): Parcel[] => {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
};
export const save = (p: Parcel[]) => localStorage.setItem(KEY, JSON.stringify(p));
