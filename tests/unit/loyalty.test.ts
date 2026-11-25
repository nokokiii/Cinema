/**
 * Unit tests for the Etap III loyalty module. No Voucherify sandbox exists yet, so these
 * exercise the in-memory fallback provider — same documented behaviour (1000 welcome points,
 * half-price redemption cap, 10 pts/PLN earned), swappable for the real client without
 * changing any caller.
 */
import { beforeEach, describe, expect, it } from "@jest/globals";
import {
  getLoyaltyProvider,
  isVoucherifyConfigured,
  maxRedeemablePoints,
  pointsEarnedForCardAmount,
  WELCOME_BONUS_POINTS,
} from "@/app/lib/loyalty";

function resetLoyaltyStore() {
  global._loyaltyMemoryStore = undefined;
}

describe("Loyalty: pure math helpers", () => {
  it("maxRedeemablePoints() to połowa ceny w groszach", () => {
    expect(maxRedeemablePoints(3200)).toBe(1600);
    expect(maxRedeemablePoints(8900)).toBe(4450);
    expect(maxRedeemablePoints(1)).toBe(0);
  });

  it("pointsEarnedForCardAmount() liczy 10 pkt za każdy pełny złoty", () => {
    expect(pointsEarnedForCardAmount(2200)).toBe(220); // 22 zł -> 220 pkt
    expect(pointsEarnedForCardAmount(7900)).toBe(790); // 79 zł -> 790 pkt
    expect(pointsEarnedForCardAmount(99)).toBe(0); // niepełny złoty -> 0
    expect(pointsEarnedForCardAmount(199)).toBe(10); // 1 pełny złoty z 1.99
  });

  it("isVoucherifyConfigured() jest false bez kluczy środowiskowych", () => {
    delete process.env.VOUCHERIFY_APPLICATION_ID;
    delete process.env.VOUCHERIFY_SECRET_KEY;
    delete process.env.VOUCHERIFY_CAMPAIGN_ID;
    expect(isVoucherifyConfigured()).toBe(false);
  });

  it("isVoucherifyConfigured() jest true gdy wszystkie 3 klucze są ustawione", () => {
    process.env.VOUCHERIFY_APPLICATION_ID = "app_123";
    process.env.VOUCHERIFY_SECRET_KEY = "sk_123";
    process.env.VOUCHERIFY_CAMPAIGN_ID = "camp_123";
    expect(isVoucherifyConfigured()).toBe(true);
    delete process.env.VOUCHERIFY_APPLICATION_ID;
    delete process.env.VOUCHERIFY_SECRET_KEY;
    delete process.env.VOUCHERIFY_CAMPAIGN_ID;
  });
});

describe("Loyalty: fallback provider (no Voucherify credentials)", () => {
  beforeEach(resetLoyaltyStore);

  it("nowy klient zaczyna z 1000 punktów powitalnych", async () => {
    const balance = await getLoyaltyProvider().getBalance("new@example.com");
    expect(balance).toBe(WELCOME_BONUS_POINTS);
  });

  it("adjustBalance() dodaje i odejmuje punkty, zwracając nowe saldo", async () => {
    const provider = getLoyaltyProvider();
    await provider.getBalance("jan@example.com"); // enrolls with 1000

    const afterEarn = await provider.adjustBalance("jan@example.com", 220);
    expect(afterEarn).toBe(1220);

    const afterSpend = await provider.adjustBalance("jan@example.com", -1000);
    expect(afterSpend).toBe(220);
  });

  it("saldo jest trwałe między wywołaniami dla tego samego e-maila", async () => {
    const provider = getLoyaltyProvider();
    await provider.adjustBalance("ola@example.com", 500);
    const balance = await provider.getBalance("ola@example.com");
    expect(balance).toBe(1500);
  });

  it("różni klienci mają niezależne salda", async () => {
    const provider = getLoyaltyProvider();
    await provider.adjustBalance("a@example.com", 100);
    const balanceA = await provider.getBalance("a@example.com");
    const balanceB = await provider.getBalance("b@example.com");
    expect(balanceA).toBe(1100);
    expect(balanceB).toBe(WELCOME_BONUS_POINTS);
  });
});
