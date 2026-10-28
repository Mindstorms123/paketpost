import { describe, it, expect, vi } from "vitest";
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false }, CapacitorHttp: { request: vi.fn() } }));
import { parseDpd, needsZip } from "@/lib/tracking";
import { isNewer } from "@/lib/update";

describe("isNewer (app update check)", () => {
  it("1.0.10 is newer than 1.0.9", () => expect(isNewer("1.0.10", "1.0.9")).toBe(true));
  it("same version is not newer", () => expect(isNewer("1.0.6", "1.0.6")).toBe(false));
  it("older is not newer", () => expect(isNewer("1.0.5", "1.0.6")).toBe(false));
  it("dev build is never compared as newer", () => expect(isNewer("1.0.6", "dev")).toBe(false));
});

describe("DPD", () => {
  it("offers the PLZ field for DPD", () => expect(needsZip("dpd")).toBe(true));
  it("parses steps newest first with place and status", () => {
    const r = parseDpd({ data: [{ pno: "01405042934216", lifecycle: { entries: [
      { datetime: "20261027101500", state: { text: "Paket an DPD übergeben" }, depotData: ["Depot Hamburg"] },
      { datetime: "20261028081000", state: { text: "In Zustellung" }, depotData: ["Depot Berlin"] },
    ] } }] });
    expect(r?.events[0]).toEqual({ at: "2026-10-28T08:10:00", text: "In Zustellung", place: "Depot Berlin" });
    expect(r?.status).toBe("In Zustellung");
    expect(r?.events).toHaveLength(2);
  });
  it("unknown parcel returns null", () => expect(parseDpd({ state: "failure" })).toBeNull());
});
