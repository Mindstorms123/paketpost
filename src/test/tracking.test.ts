import { describe, it, expect } from "vitest";
import { guessStatus } from "@/lib/tracking";

describe("guessStatus", () => {
  it("delivered", () => expect(guessStatus("Delivered")).toBe("Zugestellt"));
  it("out for delivery", () => expect(guessStatus("Out For Delivery Today")).toBe("In Zustellung"));
  it("exception", () => expect(guessStatus("Delivery exception")).toBe("Problem"));
  it("transit", () => expect(guessStatus("Departed from facility")).toBe("Unterwegs"));
});
