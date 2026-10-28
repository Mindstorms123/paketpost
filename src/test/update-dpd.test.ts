import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false }, CapacitorHttp: { request: vi.fn() } }));
import { parseDpdHtml } from "@/lib/tracking";
import { isNewer } from "@/lib/update";

describe("isNewer (app update check)", () => {
  it("1.0.10 is newer than 1.0.9", () => expect(isNewer("1.0.10", "1.0.9")).toBe(true));
  it("same version is not newer", () => expect(isNewer("1.0.6", "1.0.6")).toBe(false));
  it("older is not newer", () => expect(isNewer("1.0.5", "1.0.6")).toBe(false));
  it("dev build is never compared as newer", () => expect(isNewer("1.0.6", "dev")).toBe(false));
});

describe("DPD page", () => {
  const html = readFileSync(path.join(__dirname, "fixtures/dpd-parcel.html"), "utf8");
  const r = parseDpdHtml(html, new Date(2026, 9, 28, 10));
  it("reads the current status", () => expect(r?.status).toBe("In Zustellung"));
  it("lists only reached steps, newest first, with year", () => {
    expect(r?.events.map((e) => e.at)).toEqual(["28.10.2026", "28.10.2026", "27.10.2026", "24.10.2026"]);
    expect(r?.events[0]?.text).toBe("Paket in Zustellung");
  });
  it("December step viewed in January belongs to last year", () => {
    const j = parseDpdHtml(html.replace(">24.10.<", ">30.12.<"), new Date(2027, 0, 3));
    expect(j?.events.at(-1)?.at).toBe("30.12.2026");
  });
  it("unknown parcel page gives no result", () => expect(parseDpdHtml("<html><body>Leider keine Daten</body></html>")).toBeNull());
});
