import { expect, it } from "vitest";
import { exchangeExpired } from "../src/lib/domain/exchange";
it("does not expire accepted exchanges but expires pending ones", () => {
  expect(
    exchangeExpired(
      { status: "accepted", expiresAt: "2000-01-01" },
      Date.now(),
    ),
  ).toBe(false);
  expect(
    exchangeExpired(
      { status: "requested", expiresAt: "2000-01-01" },
      Date.now(),
    ),
  ).toBe(true);
});
