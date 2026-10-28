import { load, save, type Parcel, type Status } from "./carriers";
import { canRefresh, fetchTracking, isNative, loadKeys } from "./tracking";

export type NotifyMode = "off" | "important" | "all";
const MODE = "paketpost.notify.v1";
export const loadMode = (): NotifyMode => (localStorage.getItem(MODE) as NotifyMode) || "important";
export const saveMode = (m: NotifyMode) => localStorage.setItem(MODE, m);

const IMPORTANT: Status[] = ["In Zustellung", "Zugestellt", "Problem"];

/** Decides whether a change is worth a notification. */
export function shouldNotify(mode: NotifyMode, oldStatus: Status, newStatus: Status, oldCount: number, newCount: number): boolean {
  if (mode === "off") return false;
  if (mode === "all") return newStatus !== oldStatus || newCount > oldCount;
  return newStatus !== oldStatus && IMPORTANT.includes(newStatus);
}

/** Checks all open parcels once, saves the result and shows notifications. Runs on the device only. */
export async function checkAll(): Promise<number> {
  const keys = loadKeys(), mode = loadMode();
  let list: Parcel[] = load();
  const notes: { id: number; title: string; body: string; extra: { parcel: string } }[] = [];
  for (const p of list) {
    if (p.status === "Zugestellt" || !canRefresh(p.carrier)) continue;
    try {
      const r = await fetchTracking(p.carrier, p.number, keys, p.zip);
      const oldCount = p.events?.length ?? 0;
      if (shouldNotify(mode, p.status, r.status, oldCount, r.events.length)) {
        notes.push({ id: Math.floor(Math.random() * 2 ** 31), title: `${p.label}: ${r.status}`, body: r.events[0]?.text ?? r.status, extra: { parcel: p.id } });
      }
      list = list.map((x) => x.id !== p.id ? x : {
        ...x, events: r.events, checkedAt: Date.now(), status: r.status,
        history: r.status !== x.status ? [{ status: r.status, at: Date.now() }, ...x.history] : x.history,
      });
    } catch { /* carrier unreachable – try again next round */ }
  }
  save(list);
  window.dispatchEvent(new Event("paketpost:updated"));
  if (notes.length) {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.schedule({ notifications: notes });
  }
  return notes.length;
}

/** Starts the periodic background check (Android decides the exact timing, min. 15 min). */
export async function startBackground(): Promise<void> {
  if (!isNative()) return;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  if (loadMode() !== "off") {
    const p = await LocalNotifications.checkPermissions();
    if (p.display !== "granted") await LocalNotifications.requestPermissions();
  }
  const { BackgroundFetch } = await import("@transistorsoft/capacitor-background-fetch");
  await BackgroundFetch.configure(
    { minimumFetchInterval: 30, stopOnTerminate: false, startOnBoot: true, enableHeadless: false, requiredNetworkType: BackgroundFetch.NETWORK_TYPE_ANY },
    async (taskId) => { try { await checkAll(); } finally { BackgroundFetch.finish(taskId); } },
    async (taskId) => BackgroundFetch.finish(taskId),
  );
}
