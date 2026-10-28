import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CARRIERS, STATUSES, byId, detectCarrier, load, save, type Parcel, type Status } from "@/lib/carriers";
import { canRefresh, needsZip, fetchTracking, loadKeys, saveKeys, type Keys } from "@/lib/tracking";

const KEY_FIELDS: { group: string; portal: string; fields: { k: keyof Keys; label: string }[] }[] = [
  { group: "DHL / Deutsche Post / DHL Express", portal: "https://developer.dhl.com", fields: [{ k: "dhlKey", label: "API-Key (Shipment Tracking – Unified)" }] },
  { group: "UPS", portal: "https://developer.ups.com", fields: [{ k: "upsId", label: "Client ID" }, { k: "upsSecret", label: "Client Secret" }] },
  { group: "FedEx / TNT", portal: "https://developer.fedex.com", fields: [{ k: "fedexId", label: "API Key" }, { k: "fedexSecret", label: "Secret Key" }] },
  { group: "USPS", portal: "https://developers.usps.com", fields: [{ k: "uspsId", label: "Consumer Key" }, { k: "uspsSecret", label: "Consumer Secret" }] },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Paketpost – Pakete privat verfolgen" },
      { name: "description", content: "Alle Sendungen von DHL, Hermes, DPD, GLS, UPS & Co. an einem Ort – lokal gespeichert, ohne Tracker." },
      { property: "og:title", content: "Paketpost – Pakete privat verfolgen" },
      { property: "og:description", content: "Universelles Paket-Tracking, Local First und datenschutzfreundlich." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const dot: Record<Status, string> = {
  Angekündigt: "bg-muted-foreground",
  Unterwegs: "bg-secondary",
  "In Zustellung": "bg-primary",
  Zugestellt: "bg-success",
  Problem: "bg-destructive",
};

function Index() {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [ready, setReady] = useState(false);
  const [number, setNumber] = useState("");
  const [label, setLabel] = useState("");
  const [zip, setZip] = useState("");
  const [carrier, setCarrier] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [keys, setKeys] = useState<Keys>({});
  const [showKeys, setShowKeys] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<Record<string, string>>({});

  useEffect(() => { setParcels(load()); setKeys(loadKeys()); setReady(true); }, []);

  const refresh = async (p: Parcel) => {
    setBusy(p.id); setErr((e) => ({ ...e, [p.id]: "" }));
    try {
      const r = await fetchTracking(p.carrier, p.number, keys, p.zip);
      setParcels((all) => all.map((x) => x.id !== p.id ? x : {
        ...x, events: r.events, checkedAt: Date.now(), status: r.status,
        history: r.status !== x.status ? [{ status: r.status, at: Date.now() }, ...x.history] : x.history,
      }));
    } catch (e) {
      setErr((s) => ({ ...s, [p.id]: e instanceof Error ? e.message : "Abruf fehlgeschlagen" }));
    } finally { setBusy(null); }
  };
  useEffect(() => { if (ready) save(parcels); }, [parcels, ready]);

  const detected = useMemo(() => detectCarrier(number), [number]);
  const chosen = carrier || detected || "";

  const add = (ev: React.FormEvent) => {
    ev.preventDefault();
    const n = number.replace(/\s+/g, "").toUpperCase();
    if (!n || !chosen) return;
    const now = Date.now();
    setParcels([{ id: crypto.randomUUID(), number: n, carrier: chosen, label: label.trim() || byId(chosen).name, status: "Angekündigt", history: [{ status: "Angekündigt", at: now }], createdAt: now, zip: zip.trim() || undefined }, ...parcels]);
    setNumber(""); setLabel(""); setZip(""); setCarrier("");
  };

  const setStatus = (id: string, status: Status) =>
    setParcels(parcels.map((p) => (p.id === id ? { ...p, status, history: [{ status, at: Date.now() }, ...p.history] } : p)));

  const active = parcels.filter((p) => p.status !== "Zugestellt");
  const done = parcels.filter((p) => p.status === "Zugestellt");

  const exportData = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(parcels, null, 2)], { type: "application/json" }));
    a.download = "paketpost-backup.json"; a.click();
  };
  const importData = (f?: File) => f?.text().then((t) => { try { setParcels(JSON.parse(t)); } catch { alert("Ungültige Datei"); } });

  const Card = (p: Parcel) => {
    const c = byId(p.carrier);
    const isOpen = open === p.id;
    return (
      <li key={p.id} className="rounded-2xl border bg-card p-4 shadow-sm">
        <button className="flex w-full items-start gap-3 text-left" onClick={() => setOpen(isOpen ? null : p.id)}>
          <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${dot[p.status]}`} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{p.label}</span>
            <span className="block text-xs text-muted-foreground">{c.name} · {p.status}</span>
            <span className="block truncate font-mono text-xs text-muted-foreground">{p.number}</span>
          </span>
        </button>
        <div className="mt-3 flex gap-2">
          {canRefresh(p.carrier) && (
            <button onClick={() => refresh(p)} disabled={busy === p.id} className="flex-1 rounded-xl bg-secondary py-2.5 text-sm font-bold text-secondary-foreground disabled:opacity-60">
              {busy === p.id ? "Lädt…" : "↻ Aktualisieren"}
            </button>
          )}
          <a href={c.url(p.number)} target="_blank" rel="noopener noreferrer" className="flex-1 rounded-xl bg-primary py-2.5 text-center text-sm font-bold text-primary-foreground">
            Bei {c.name} ↗
          </a>
        </div>
        {err[p.id] && <p className="mt-2 text-xs text-destructive">{err[p.id]}</p>}
        {p.events?.[0] && !isOpen && (
          <p className="mt-2 text-xs text-muted-foreground">{p.events[0].text}{p.events[0].place ? ` · ${p.events[0].place}` : ""}</p>
        )}
        {isOpen && (
          <div className="mt-4 space-y-4">
            {p.events && p.events.length > 0 && (
              <ol className="space-y-2 border-l-2 border-primary pl-3 text-xs">
                {p.events.map((ev, i) => (
                  <li key={i}><b>{ev.text}</b><br /><span className="text-muted-foreground">{new Date(ev.at).toLocaleString("de-DE")}{ev.place ? ` · ${ev.place}` : ""}</span></li>
                ))}
              </ol>
            )}
            {p.checkedAt && <p className="text-xs text-muted-foreground">Zuletzt abgerufen: {new Date(p.checkedAt).toLocaleString("de-DE")}</p>}
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => (
                <button key={s} onClick={() => setStatus(p.id, s)} className={`rounded-full border px-3 py-1 text-xs ${p.status === s ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>{s}</button>
              ))}
            </div>
            <ol className="space-y-1 border-l-2 pl-3 text-xs text-muted-foreground">
              {p.history.map((h, i) => <li key={i}><b className="text-foreground">{h.status}</b> · {new Date(h.at).toLocaleString("de-DE")}</li>)}
            </ol>
            <div className="flex gap-3 text-xs">
              <button className="underline" onClick={() => navigator.clipboard?.writeText(p.number)}>Nummer kopieren</button>
              <button className="text-destructive underline" onClick={() => confirm("Paket löschen?") && setParcels(parcels.filter((x) => x.id !== p.id))}>Löschen</button>
            </div>
          </div>
        )}
      </li>
    );
  };

  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 pb-16 pt-8 font-sans">
      <header className="mb-6">
        <h1 className="font-display text-4xl font-extrabold text-primary">Paketpost</h1>
        <p className="mt-1 text-sm text-muted-foreground">Alle Pakete. Nur auf deinem Gerät. Kein Konto, keine Tracker.</p>
      </header>

      <form onSubmit={add} className="space-y-2 rounded-3xl bg-primary p-4 text-primary-foreground">
        <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Sendungsnummer" className="w-full rounded-xl bg-primary-foreground px-4 py-3 font-mono text-foreground outline-none" />
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Bezeichnung (z. B. Neue Schuhe)" className="w-full rounded-xl bg-primary-foreground px-4 py-3 text-foreground outline-none" />
        <select value={chosen} onChange={(e) => setCarrier(e.target.value)} className="w-full rounded-xl bg-primary-foreground px-4 py-3 text-foreground">
          <option value="">Paketdienst wählen…</option>
          {CARRIERS.map((c) => <option key={c.id} value={c.id}>{c.name}{c.id === detected ? " (erkannt)" : ""}</option>)}
        </select>
        {needsZip(chosen) && <input value={zip} onChange={(e) => setZip(e.target.value)} inputMode="numeric" placeholder="Empfänger-PLZ (für Details, optional)" className="w-full rounded-xl bg-primary-foreground px-4 py-3 text-foreground outline-none" />}
        <button disabled={!number || !chosen} className="w-full rounded-xl bg-secondary py-3 font-bold text-secondary-foreground disabled:opacity-50">Paket hinzufügen</button>
      </form>

      <section className="mt-8">
        <h2 className="mb-3 font-display text-xl font-semibold">Unterwegs ({active.length})</h2>
        {ready && active.length === 0 && <p className="text-sm text-muted-foreground">Noch keine offenen Sendungen.</p>}
        <ul className="space-y-3">{active.map(Card)}</ul>
      </section>

      {done.length > 0 && (
        <section className="mt-8">
          <button onClick={() => setShowDone(!showDone)} className="mb-3 font-display text-xl font-semibold">Zugestellt ({done.length}) {showDone ? "▾" : "▸"}</button>
          {showDone && <ul className="space-y-3">{done.map(Card)}</ul>}
        </section>
      )}

      <section className="mt-10 rounded-2xl border bg-card p-4">
        <button onClick={() => setShowKeys(!showKeys)} className="w-full text-left font-display text-xl font-semibold">Eigene Zugänge (optional) {showKeys ? "▾" : "▸"}</button>
        {showKeys && (
          <div className="mt-3 space-y-5 text-sm">
            <p className="text-xs text-muted-foreground">Nicht nötig: DHL, Deutsche Post, DPD und GLS ruft die App ohne Zugang direkt beim Paketdienst ab. Optional für UPS, FedEx, USPS oder falls DHL blockt – deine eigenen, kostenlosen Entwickler-Zugänge. Sie bleiben nur auf diesem Gerät, und die App fragt damit direkt beim Paketdienst an. Andere Dienste (DPD, Hermes, GLS, Amazon …) bieten Privatpersonen keinen Zugang, dafür gibt es den Link.</p>
            {KEY_FIELDS.map((g) => (
              <div key={g.group} className="space-y-1.5">
                <div className="flex items-baseline justify-between"><b>{g.group}</b><a href={g.portal} target="_blank" rel="noopener noreferrer" className="text-xs underline">Zugang holen ↗</a></div>
                {g.fields.map((f) => (
                  <input key={f.k} type="password" autoComplete="off" placeholder={f.label} value={keys[f.k] ?? ""}
                    onChange={(e) => { const n = { ...keys, [f.k]: e.target.value.trim() }; setKeys(n); saveKeys(n); }}
                    className="w-full rounded-xl border bg-background px-3 py-2 font-mono text-xs" />
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="mt-6 space-y-3 rounded-2xl border p-4 text-xs text-muted-foreground">
        <p>🔒 Daten liegen ausschließlich im Speicher dieses Geräts. Der Live-Status öffnet direkt die offizielle Seite des Paketdienstes – kein Zwischenhändler sieht deine Nummern.</p>
        <p>📱 Als App installieren: in Chrome auf Android ⋮ → „App installieren“ / „Zum Startbildschirm“.</p>
        <div className="flex gap-4">
          <button className="underline" onClick={exportData}>Backup exportieren</button>
          <label className="cursor-pointer underline">Backup importieren<input type="file" accept="application/json" className="hidden" onChange={(e) => importData(e.target.files?.[0])} /></label>
        </div>
      </footer>
    </main>
  );
}
