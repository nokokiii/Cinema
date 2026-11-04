// In-memory fixed-window rate limiter keyed by client IP and endpoint bucket
import { NextResponse } from "next/server";

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export const RATE_LIMITS = {
  events: { limit: 60, windowMs: 60_000 },
  createReservation: { limit: 10, windowMs: 60_000 },
  getReservation: { limit: 30, windowMs: 60_000 },
  purchase: { limit: 10, windowMs: 60_000 },
} satisfies Record<string, RateLimitRule>;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

interface WindowState {
  count: number;
  resetAt: number;
}

declare global {
  var _rateLimitStore: Map<string, WindowState> | undefined;
}

const MAX_TRACKED_KEYS = 10_000;

function getStore(): Map<string, WindowState> {
  if (!global._rateLimitStore) {
    global._rateLimitStore = new Map();
  }
  return global._rateLimitStore;
}

function pruneExpired(store: Map<string, WindowState>, now: number) {
  for (const [key, state] of store) {
    if (state.resetAt <= now) store.delete(key);
  }
}

export function getClientIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return "unknown";
}

export function consumeRateLimit(
  key: string,
  rule: RateLimitRule,
  now: number = Date.now()
): { allowed: boolean; remaining: number; resetAt: number } {
  const store = getStore();
  if (store.size > MAX_TRACKED_KEYS) pruneExpired(store, now);

  let state = store.get(key);
  if (!state || state.resetAt <= now) {
    state = { count: 0, resetAt: now + rule.windowMs };
    store.set(key, state);
  }

  state.count++;
  return {
    allowed: state.count <= rule.limit,
    remaining: Math.max(0, rule.limit - state.count),
    resetAt: state.resetAt,
  };
}

/**
 * Returns a 429 response when the client exceeded the bucket's limit, otherwise null.
 */
export function enforceRateLimit(
  request: Request,
  bucket: RateLimitBucket
): NextResponse | null {
  if (process.env.RATE_LIMIT_DISABLED === "true") return null;

  const rule = RATE_LIMITS[bucket];
  const result = consumeRateLimit(`${bucket}:${getClientIp(request)}`, rule);
  if (result.allowed) return null;

  const retryAfterSeconds = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return NextResponse.json(
    { error: "Too many requests, please try again later" },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Limit": String(rule.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
      },
    }
  );
}
