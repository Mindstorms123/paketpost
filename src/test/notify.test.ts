import { describe, it, expect, vi } from "vitest";
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false }, CapacitorHttp: { request: vi.fn() } }));
import { shouldNotify } from "@/lib/background";

describe("shouldNotify", () => {
  it("off never notifies", () => expect(shouldNotify("off", "Unterwegs", "Zugestellt", 1, 2)).toBe(false));
  it("important: In Zustellung notifies", () => expect(shouldNotify("important", "Unterwegs", "In Zustellung", 1, 2)).toBe(true));
  it("important: new transit step stays quiet", () => expect(shouldNotify("important", "Unterwegs", "Unterwegs", 1, 2)).toBe(false));
  it("all: every new step notifies", () => expect(shouldNotify("all", "Unterwegs", "Unterwegs", 1, 2)).toBe(true));
  it("all: nothing new stays quiet", () => expect(shouldNotify("all", "Unterwegs", "Unterwegs", 2, 2)).toBe(false));
});
