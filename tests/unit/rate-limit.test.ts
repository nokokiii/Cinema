import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import {
  RATE_LIMITS,
  consumeRateLimit,
  enforceRateLimit,
  getClientIp,
} from "@/app/lib/rate-limit";

function requestFrom(ip: string): Request {
  return new Request("http://localhost/api/reservations", {
    method: "POST",
    headers: { "x-forwarded-for": `${ip}, 10.0.0.1` },
  });
}

describe("Rate limiting", () => {
  beforeEach(() => {
    global._rateLimitStore = undefined;
    delete process.env.RATE_LIMIT_DISABLED;
  });

  afterEach(() => {
    delete process.env.RATE_LIMIT_DISABLED;
  });

  it("getClientIp() bierze pierwszy adres z x-forwarded-for", () => {
    expect(getClientIp(requestFrom("1.2.3.4"))).toBe("1.2.3.4");
  });

  it("Przepuszcza żądania do limitu, kolejne blokuje", () => {
    const rule = { limit: 3, windowMs: 1000 };
    const results = Array.from({ length: 4 }, () => consumeRateLimit("k", rule, 0));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
  });

  it("Okno resetuje się po upływie windowMs", () => {
    const rule = { limit: 1, windowMs: 1000 };
    expect(consumeRateLimit("k", rule, 0).allowed).toBe(true);
    expect(consumeRateLimit("k", rule, 500).allowed).toBe(false);
    expect(consumeRateLimit("k", rule, 1000).allowed).toBe(true);
  });

  it("enforceRateLimit() zwraca 429 z nagłówkami po przekroczeniu limitu", () => {
    const { limit } = RATE_LIMITS.createReservation;
    for (let i = 0; i < limit; i++) {
      expect(enforceRateLimit(requestFrom("5.5.5.5"), "createReservation")).toBeNull();
    }

    const blocked = enforceRateLimit(requestFrom("5.5.5.5"), "createReservation");
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get("Retry-After")).toBeTruthy();
    expect(blocked?.headers.get("X-RateLimit-Limit")).toBe(String(limit));

    // Inny klient i inny endpoint mają osobne liczniki
    expect(enforceRateLimit(requestFrom("6.6.6.6"), "createReservation")).toBeNull();
    expect(enforceRateLimit(requestFrom("5.5.5.5"), "getReservation")).toBeNull();
  });

  it("RATE_LIMIT_DISABLED=true wyłącza limit", () => {
    process.env.RATE_LIMIT_DISABLED = "true";
    for (let i = 0; i < 100; i++) {
      expect(enforceRateLimit(requestFrom("7.7.7.7"), "purchase")).toBeNull();
    }
  });
});
