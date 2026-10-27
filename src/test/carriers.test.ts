import { describe, it, expect } from "vitest";
import { detectCarrier } from "@/lib/carriers";

describe("detectCarrier", () => {
  it("UPS", () => expect(detectCarrier("1Z999AA10123456784")).toBe("ups"));
  it("Deutsche Post Einschreiben", () => expect(detectCarrier("RR123456789DE")).toBe("post"));
  it("DHL JJD", () => expect(detectCarrier("JJD000390007777777777")).toBe("dhl"));
  it("unknown", () => expect(detectCarrier("xyz")).toBeNull());
});
