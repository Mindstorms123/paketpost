import { guessStatus, parseDpdHtml, type TrackEvent, type TrackResult } from "./tracking";

/**
 * Reads the detailed DPD history from the visible text of myParcel.aspx
 * (after the user entered the postcode and solved the captcha themselves).
 * Lines like "28.10.2026, 07:12" followed by place / description.
 */
export function parseDpdDetailText(text: string): TrackResult | null {
  const lines = text.split(/\n+/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const events: TrackEvent[] = [];
  const re = /^(\d{1,2}\.\d{1,2}\.\d{2,4}),?\s*(\d{1,2}:\d{2})?(?:\s*Uhr)?\s*(.*)$/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(re);
    if (!m) continue;
    const rest = m[3] ? [m[3]] : [];
    let j = i + 1;
    while (rest.length < 2 && j < lines.length && !re.test(lines[j]!)) rest.push(lines[j++]!);
    const text = rest.at(-1) ?? "";
    if (!text || text.length > 160) continue;
    events.push({ at: m[2] ? `${m[1]} ${m[2]}` : m[1]!, text, ...(rest.length > 1 && rest[0] ? { place: rest[0] } : {}) });
    i = j - 1;
  }
  const win = text.match(/(Heute|Morgen|\d{1,2}\.\d{1,2}\.\d{0,4}),?\s*(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  if (win) events.unshift({ at: "", text: `Voraussichtliche Zustellung: ${win[1]}, ${win[2]}–${win[3]} Uhr` });
  if (!events.length) return null;
  return { status: guessStatus(events.find((e) => e.at)?.text ?? text), events };
}

/** Combines the detailed text history with the 5 basic steps from the page HTML. */
export function readDpdPage(text: string, html: string): TrackResult | null {
  const d = parseDpdDetailText(text);
  const basic = parseDpdHtml(html);
  if (!d) return basic;
  const hasHistory = d.events.some((e) => e.at);
  if (!hasHistory && basic) return { status: basic.status, events: [...d.events, ...basic.events] };
  return d;
}

/** Script run on every DPD page load: fill in number/PLZ, send page content back once details are visible. */
export const dpdPageScript = (n: string, zip?: string) => `(() => {
  const n = ${JSON.stringify(n)}, zip = ${JSON.stringify(zip ?? "")};
  const fill = (sel, v) => document.querySelectorAll(sel).forEach((i) => { if (v && !i.value) { i.value = v; i.dispatchEvent(new Event("input", { bubbles: true })); } });
  const tick = (k) => {
    fill('input[name*="ParcelSearch" i], input[name*="TrackYourParcel" i], input[name*="parcelno" i]', n);
    fill('input[name*="zip" i], input[name*="plz" i], input[id*="zip" i], input[id*="plz" i]', zip);
    const t = document.body ? document.body.innerText : "";
    if (/Lieferzeit|Paketverlauf|\\d{1,2}\\.\\d{1,2}\\.\\d{0,4},?\\s*\\d{1,2}:\\d{2}/i.test(t) && t.includes(n)) {
      window.mobileApp && window.mobileApp.postMessage({ detail: { dpd: t, html: document.documentElement.outerHTML } });
    } else if (k < 40) setTimeout(() => tick(k + 1), 1500);
  };
  tick(0);
})();`;

/** Opens DPD's page in the app; the user enters postcode + captcha, the app reads the result. */
export async function unlockDpd(n: string, zip?: string): Promise<TrackResult> {
  const { InAppBrowser } = await import("@capgo/inappbrowser");
  // Fallback if DPD still asks for the number: it is already in the clipboard.
  try { await navigator.clipboard.writeText(n); } catch { /* not allowed – ignore */ }
  const script = dpdPageScript(n, zip);
  return new Promise((resolve, reject) => {
    let done = false;
    const subs: Promise<{ remove: () => Promise<void> }>[] = [];
    const end = () => subs.forEach((s) => s.then((h) => h.remove()));
    subs.push(InAppBrowser.addListener("browserPageLoaded", () => { InAppBrowser.executeScript({ code: script }).catch(() => {}); }));
    subs.push(InAppBrowser.addListener("messageFromWebview", (e) => {
      const t = e.detail?.["dpd"], h = e.detail?.["html"];
      if (typeof t !== "string" || done) return;
      const r = readDpdPage(t, typeof h === "string" ? h : "");
      if (r) { done = true; end(); resolve(r); InAppBrowser.close().catch(() => {}); }
    }));
    subs.push(InAppBrowser.addListener("closeEvent", () => {
      setTimeout(() => { if (!done) { done = true; end(); reject(new Error("Keine Details erhalten. PLZ und Captcha auf der DPD-Seite eingeben.")); } }, 800);
    }));
    InAppBrowser.openWebView({
      // Same entry as the normal DPD link: sets the session and opens the parcel directly.
      url: `https://my.dpd.de/redirect.aspx?action=12&parcelno=${encodeURIComponent(n)}${zip ? `&zip=${encodeURIComponent(zip)}` : ""}`,
      title: "DPD – PLZ und Captcha eingeben",
    }).catch((e) => { done = true; end(); reject(e); });
  });
}
