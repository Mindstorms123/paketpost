import { describe, it, expect, vi } from "vitest";
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false }, CapacitorHttp: { request: vi.fn() } }));
import { parseDpdDetailText } from "@/lib/dpd-detail";

const page = `Winit Germany GmbH
01497113012484
In Zustellung
Lieferzeit
Heute, 12:46-13:16
Paketverlauf
28.10.2026, 07:12
Georgsmarienhütte (DE)
Paket in Zustellung
27.10.2026, 22:01
Hamburg (DE)
Paket im Paketzustellzentrum`;

describe("DPD detail page (after captcha)", () => {
  const r = parseDpdDetailText(page)!;
  it("shows the delivery window first", () => expect(r.events[0]?.text).toBe("Voraussichtliche Zustellung: Heute, 12:46–13:16 Uhr"));
  it("reads time, place and text", () => expect(r.events[1]).toEqual({ at: "28.10.2026 07:12", place: "Georgsmarienhütte (DE)", text: "Paket in Zustellung" }));
  it("status from newest step", () => expect(r.status).toBe("In Zustellung"));
  it("page without history gives nothing", () => expect(parseDpdDetailText("Bitte PLZ eingeben")).toBeNull());
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { readDpdPage } from "@/lib/dpd-detail";
describe("DPD page with only the delivery window", () => {
  const html = readFileSync(path.join(__dirname, "fixtures/dpd-parcel.html"), "utf8");
  const r = readDpdPage("01497113012484\nIn Zustellung\nLieferzeit\nHeute, 12:42-13:12", html)!;
  it("window first, then the basic steps", () => {
    expect(r.events[0]?.text).toBe("Voraussichtliche Zustellung: Heute, 12:42–13:12 Uhr");
    expect(r.events[1]?.text).toBe("Paket in Zustellung");
  });
});
