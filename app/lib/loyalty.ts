// Loyalty points (Etap III). Voucherify is the documented source of truth for balance;
// when no Voucherify credentials are configured, a local fallback (Mongo, else in-memory —
// mirroring the same pattern as mongodb.ts/events-service.ts) stands in so the whole points
// flow can still be built, wired up, and tested end-to-end before a real account exists.
import type { Db } from "mongodb";
import { getDb } from "./mongodb";
import { LoyaltyAccountDocument } from "./types";

export const WELCOME_BONUS_POINTS = 1000;
export const POINTS_PER_PLN_EARNED = 10; // 10 points per every full PLN paid by card
const GROSZE_PER_PLN = 100;

/** 1 point = 1 grosz; a customer may cover at most half the ticket price with points. */
export function maxRedeemablePoints(amountMinor: number): number {
  return Math.floor(amountMinor / 2);
}

/** Points are only earned on the card-paid part, counted in full PLN. */
export function pointsEarnedForCardAmount(amountPaidByCardMinor: number): number {
  return Math.floor(amountPaidByCardMinor / GROSZE_PER_PLN) * POINTS_PER_PLN_EARNED;
}

export interface LoyaltyProvider {
  getBalance(email: string): Promise<number>;
  /** positive adds, negative subtracts; returns the new balance */
  adjustBalance(email: string, points: number): Promise<number>;
}

function getVoucherifyConfig() {
  const applicationId = process.env.VOUCHERIFY_APPLICATION_ID ?? "";
  const secretKey = process.env.VOUCHERIFY_SECRET_KEY ?? "";
  const campaignId = process.env.VOUCHERIFY_CAMPAIGN_ID ?? "";
  const apiUrl = process.env.VOUCHERIFY_API_URL ?? "https://api.voucherify.io";
  return {
    enabled: Boolean(applicationId && secretKey && campaignId),
    applicationId,
    secretKey,
    campaignId,
    apiUrl,
  };
}

/**
 * Talks to Voucherify's legacy v1 loyalty API (the one the project brief names explicitly:
 * POST /v1/loyalties/members/{memberId}/balance). Written against Voucherify's published
 * docs since there is no sandbox account yet to verify it live:
 *  - https://docs.voucherify.io/reference/get-member-1 (GET /v1/loyalties/members/{memberId})
 *  - https://docs.voucherify.io/api-reference/loyalties/adjust-loyalty-card-balance
 *  - https://docs.voucherify.io/api-reference/loyalties/add-member
 * ASSUMPTIONS flagged for whoever connects the real account to double-check first:
 *  - `memberId` in both endpoints is passed as the customer's email directly (the brief says
 *    "use the email as the customer identifier"); Voucherify's docs describe memberId as the
 *    loyalty card's own code, so this may need a lookup/translation step once real data exists.
 *  - The welcome bonus (1000 pts) is assumed to be a Voucherify campaign rule applied on
 *    enrollment (configured in the dashboard per the setup ticket), not something this client
 *    grants itself.
 */
class VoucherifyLoyaltyProvider implements LoyaltyProvider {
  private config: ReturnType<typeof getVoucherifyConfig>;
  // Short client-side cache for balance reads only, per the documented 100 req/h sandbox cap.
  private static balanceCache = new Map<string, { balance: number; at: number }>();
  private static BALANCE_CACHE_TTL_MS = 30_000;

  constructor(config: ReturnType<typeof getVoucherifyConfig>) {
    this.config = config;
  }

  private headers(): Record<string, string> {
    return {
      "X-App-Id": this.config.applicationId,
      "X-App-Token": this.config.secretKey,
      "Content-Type": "application/json",
    };
  }

  private async enrollMember(email: string): Promise<void> {
    const res = await fetch(`${this.config.apiUrl}/v1/loyalties/${this.config.campaignId}/members`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ customer: { source_id: email, email } }),
    });
    // 409 means the member already exists, which is fine.
    if (!res.ok && res.status !== 409) {
      throw new Error(`Voucherify: failed to enroll member (${res.status})`);
    }
  }

  async getBalance(email: string): Promise<number> {
    const cached = VoucherifyLoyaltyProvider.balanceCache.get(email);
    if (cached && Date.now() - cached.at < VoucherifyLoyaltyProvider.BALANCE_CACHE_TTL_MS) {
      return cached.balance;
    }

    const fetchBalance = () =>
      fetch(`${this.config.apiUrl}/v1/loyalties/members/${encodeURIComponent(email)}`, {
        headers: this.headers(),
      });

    let res = await fetchBalance();
    if (res.status === 404) {
      await this.enrollMember(email);
      res = await fetchBalance();
    }
    if (!res.ok) {
      throw new Error(`Voucherify: failed to read balance (${res.status})`);
    }
    const data = (await res.json()) as { loyalty_card?: { balance?: number } };
    const balance = data.loyalty_card?.balance ?? 0;
    VoucherifyLoyaltyProvider.balanceCache.set(email, { balance, at: Date.now() });
    return balance;
  }

  async adjustBalance(email: string, points: number): Promise<number> {
    const res = await fetch(
      `${this.config.apiUrl}/v1/loyalties/members/${encodeURIComponent(email)}/balance`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ points }),
      }
    );
    if (!res.ok) {
      throw new Error(`Voucherify: failed to adjust balance (${res.status})`);
    }
    const data = (await res.json()) as { balance: number };
    VoucherifyLoyaltyProvider.balanceCache.delete(email);
    return data.balance;
  }
}

// ---- Fallback used until a real Voucherify account exists (Mongo, else in-memory) ----

declare global {
  var _loyaltyMemoryStore: Map<string, number> | undefined;
}

function getMemoryLoyaltyStore(): Map<string, number> {
  if (!global._loyaltyMemoryStore) global._loyaltyMemoryStore = new Map();
  return global._loyaltyMemoryStore;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (error as { code?: number } | null)?.code === 11000;
}

/**
 * Ensures the account row exists (seeded with the welcome bonus) and returns its balance.
 * Two concurrent first-touches for the same new e-mail race on insertOne; the loser's
 * duplicate-key error is expected and just means the winner already created the row.
 */
async function ensureLoyaltyAccount(db: Db | null, email: string): Promise<number> {
  if (db) {
    const collection = db.collection<LoyaltyAccountDocument>("loyaltyAccounts");
    const existing = await collection.findOne({ _id: email });
    if (existing) return existing.balance;
    try {
      await collection.insertOne({ _id: email, balance: WELCOME_BONUS_POINTS });
      return WELCOME_BONUS_POINTS;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const raced = await collection.findOne({ _id: email });
      return raced?.balance ?? WELCOME_BONUS_POINTS;
    }
  }

  const store = getMemoryLoyaltyStore();
  if (!store.has(email)) store.set(email, WELCOME_BONUS_POINTS);
  return store.get(email)!;
}

class FallbackLoyaltyProvider implements LoyaltyProvider {
  async getBalance(email: string): Promise<number> {
    const db = await getDb();
    return ensureLoyaltyAccount(db, email);
  }

  /**
   * Applies the delta with a single atomic increment (Mongo's $inc, or a same-tick
   * read-then-write for the in-memory store) instead of read-then-write across two separate
   * awaits — two concurrent adjustments for the same customer (e.g. spending points on one
   * reservation while earning them on another) would otherwise silently lose one update.
   */
  async adjustBalance(email: string, points: number): Promise<number> {
    const db = await getDb();
    await ensureLoyaltyAccount(db, email);

    if (db) {
      const updated = await db
        .collection<LoyaltyAccountDocument>("loyaltyAccounts")
        .findOneAndUpdate({ _id: email }, { $inc: { balance: points } }, { returnDocument: "after" });
      return updated?.balance ?? 0;
    }

    // No await between the read and the write below: this runs as one synchronous turn,
    // so a concurrent call can only ever see it fully applied or not at all.
    const store = getMemoryLoyaltyStore();
    const next = (store.get(email) ?? WELCOME_BONUS_POINTS) + points;
    store.set(email, next);
    return next;
  }
}

export function getLoyaltyProvider(): LoyaltyProvider {
  const config = getVoucherifyConfig();
  return config.enabled ? new VoucherifyLoyaltyProvider(config) : new FallbackLoyaltyProvider();
}

export function isVoucherifyConfigured(): boolean {
  return getVoucherifyConfig().enabled;
}
