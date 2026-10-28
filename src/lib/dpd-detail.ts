import { guessStatus, type TrackEvent, type TrackResult } from "./tracking";

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

/** Opens DPD's page in the app; the user enters postcode + captcha, the app reads the result. */
export async function unlockDpd(n: string, zip?: string): Promise<TrackResult> {
  const { InAppBrowser } = await import("@capgo/inappbrowser");
  const script = `
    const zip = ${JSON.stringify(zip ?? "")};
    const tick = () => {
      const z = document.querySelector('input[name*="zip" i], input[name*="plz" i], input[id*="Zip" i]');
      if (z && zip && !z.value) z.value = zip;
      const t = document.body ? document.body.innerText : "";
      if (/\\d{1,2}\\.\\d{1,2}\\.\\d{2,4},?\\s*\\d{1,2}:\\d{2}/.test(t) && !document.querySelector('[id*="aptcha" i] input, input[name*="aptcha" i]')) {
        window.mobileApp.postMessage({ detail: { dpd: t } });
        setTimeout(() => window.mobileApp.close(), 400);
      } else setTimeout(tick, 1500);
    };
    tick();`;
  return new Promise((resolve, reject) => {
    let done = false;
    const subs: Promise<{ remove: () => Promise<void> }>[] = [];
    const end = () => subs.forEach((s) => s.then((h) => h.remove()));
    subs.push(InAppBrowser.addListener("messageFromWebview", (e) => {
      const t = e.detail?.["dpd"];
      if (typeof t !== "string" || done) return;
      const r = parseDpdDetailText(t);
      if (r) { done = true; end(); resolve(r); }
    }));
    subs.push(InAppBrowser.addListener("closeEvent", () => {
      setTimeout(() => { if (!done) { done = true; end(); reject(new Error("Keine Details erhalten. PLZ und Captcha auf der DPD-Seite eingeben.")); } }, 800);
    }));
    InAppBrowser.openWebView({
      url: `https://my.dpd.de/myParcel.aspx?parcelno=${encodeURIComponent(n)}`,
      title: "DPD – PLZ und Captcha eingeben",
      isPresentAfterPageLoad: true,
      preShowScript: script,
      preShowScriptInjectionTime: "pageLoad",
    }).catch((e) => { done = true; end(); reject(e); });
  });
}
