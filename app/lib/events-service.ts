// Cinema booking service supporting MongoDB with resilient in-memory fallback
import { randomBytes, randomUUID } from "crypto";
import type { Db } from "mongodb";
import { getDb } from "./mongodb";
import { MAX_SEATS_PER_RESERVATION } from "./seats";
import {
  CreateReservationResponse,
  EventDocument,
  ReservationDocument,
  SeatLockDocument,
} from "./types";

/**
 * Generates an 8x10 cinema seat layout (Rows A to H, Seats 1 to 10).
 * Total: 80 seats (e.g. A1, A2, ..., H10).
 */
export function generateCinemaSeats(): string[] {
  const rows = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const seats: string[] = [];
  for (const row of rows) {
    for (let num = 1; num <= 10; num++) {
      seats.push(`${row}${num}`);
    }
  }
  return seats;
}

/**
 * Default sample screening events matching project requirements:
 * 3 screenings across 2 cinema halls with 8x10 seats each.
 */
export const INITIAL_EVENTS: EventDocument[] = [
  {
    _id: "seans-2026-11-21-1800",
    title: "Kosmiczna podróż",
    startsAt: "2026-11-21T18:00:00.000Z",
    hall: "Sala 1",
    seats: generateCinemaSeats(),
    description: "Epicka podróż przez czasoprzestrzeń w poszukiwaniu nowego domu dla ludzkości.",
    durationMinutes: 169,
    genre: "Sci-Fi / Przygodowy",
  },
  {
    _id: "seans-2026-11-21-2030",
    title: "Diuna: Część Druga",
    startsAt: "2026-11-21T20:30:00.000Z",
    hall: "Sala 2",
    seats: generateCinemaSeats(),
    description: "Paul Atryda jednoczy siły z Chani i Fremenami, aby dokonać zemsty na spiskowcach.",
    durationMinutes: 166,
    genre: "Sci-Fi / Akcja",
  },
  {
    _id: "seans-2026-11-22-1915",
    title: "Oppenheimer",
    startsAt: "2026-11-22T19:15:00.000Z",
    hall: "Sala 1",
    seats: generateCinemaSeats(),
    description: "Historia amerykańskiego fizyka J. Roberta Oppenheimera i prac nad bombą atomową.",
    durationMinutes: 180,
    genre: "Biograficzny / Dramat",
  },
];

// In-memory store definition for offline testing or when MongoDB Atlas IP is blocked
interface InMemoryStore {
  events: EventDocument[];
  reservations: ReservationDocument[];
}

declare global {
  var _inMemoryStore: InMemoryStore | undefined;
}

function getMemoryStore(): InMemoryStore {
  if (!global._inMemoryStore) {
    global._inMemoryStore = {
      events: JSON.parse(JSON.stringify(INITIAL_EVENTS)),
      reservations: [],
    };
  }
  return global._inMemoryStore;
}

/**
 * Returns reservation timeout in minutes from env (defaults to 15, or 2 for testing).
 */
export function getReservationTimeoutMinutes(): number {
  const envVal = process.env.RESERVATION_TIMEOUT_MINUTES;
  if (!envVal) return 15;
  const parsed = parseInt(envVal, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15;
}

/**
 * Generates a unique user-friendly ticket code (e.g. TKT-F7-A1B2C3).
 */
export function generateTicketCode(seatId: string): string {
  const randomPart = randomBytes(3).toString("hex").toUpperCase();
  return `TKT-${seatId.toUpperCase()}-${randomPart}`;
}

/**
 * Ensures initial events are present in MongoDB if database is connected.
 */
export async function ensureInitialEventsSeeded(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const count = await db.collection<EventDocument>("events").countDocuments();
  if (count === 0) {
    await db.collection<EventDocument>("events").insertMany(INITIAL_EVENTS);
  }
}

/**
 * Retrieves all events from MongoDB or in-memory fallback.
 */
export async function getAllEvents(): Promise<EventDocument[]> {
  const db = await getDb();
  if (db) {
    await ensureInitialEventsSeeded();
    return db.collection<EventDocument>("events").find().toArray();
  }

  return getMemoryStore().events;
}

/**
 * Retrieves a single event by its ID.
 */
export async function getEventById(eventId: string): Promise<EventDocument | null> {
  const db = await getDb();
  if (db) {
    await ensureInitialEventsSeeded();
    return db.collection<EventDocument>("events").findOne({ _id: eventId });
  }

  const found = getMemoryStore().events.find((e) => e._id === eventId);
  return found ?? null;
}

/**
 * Retrieves all taken seat IDs for an event.
 * A seat is taken if:
 * 1. It is purchased (status: "PURCHASED")
 * 2. It has an active, non-expired reservation (status: "RESERVED" and expiresAt > now)
 */
export async function getTakenSeats(eventId: string): Promise<string[]> {
  const now = new Date();
  const db = await getDb();

  if (db) {
    const activeReservations = await db.collection<ReservationDocument>("reservations").find({
      eventId,
      $or: [
        { status: "PURCHASED" },
        { status: "RESERVED", expiresAt: { $gt: now } },
      ],
    }).toArray();

    return activeReservations.flatMap((res) => res.seatIds);
  }

  // In-memory fallback
  const store = getMemoryStore();
  const activeReservations = store.reservations.filter((res) => {
    if (res.eventId !== eventId) return false;
    if (res.status === "PURCHASED") return true;
    if (res.status === "RESERVED") {
      const expiry = new Date(res.expiresAt);
      return expiry > now;
    }
    return false;
  });

  return activeReservations.flatMap((res) => res.seatIds);
}

/**
 * Creates a single reservation holding all requested seats if every one of them is free.
 */
export async function createReservation({
  eventId,
  seatIds,
  customerName,
  email,
}: {
  eventId: string;
  seatIds: string[];
  customerName: string;
  email: string;
}): Promise<CreateReservationResponse> {
  const event = await getEventById(eventId);
  if (!event) {
    throw new Error("EVENT_NOT_FOUND");
  }

  const requestedSeats = [...new Set(seatIds)].sort();
  if (
    requestedSeats.length === 0 ||
    requestedSeats.length > MAX_SEATS_PER_RESERVATION ||
    !requestedSeats.every((seat) => event.seats.includes(seat))
  ) {
    throw new Error("SEAT_INVALID");
  }

  const db = await getDb();

  const now = new Date();
  const expiresAt = new Date(now.getTime() + getReservationTimeoutMinutes() * 60 * 1000);
  const candidate: ReservationDocument = {
    _id: randomUUID(),
    eventId,
    seatIds: requestedSeats,
    customerName: customerName.trim(),
    email: email.trim().toLowerCase(),
    code: generateTicketCode(requestedSeats[0]),
    status: "RESERVED",
    createdAt: now,
    expiresAt,
  };

  if (db) {
    await ensureIndexes(db);
    return createReservationInMongo(db, candidate);
  }
  return createReservationInMemory(candidate);
}

function toReservationResponse(reservation: ReservationDocument): CreateReservationResponse {
  return {
    reservationId: reservation._id,
    expiresAt: new Date(reservation.expiresAt).toISOString(),
    code: reservation.code,
    seatIds: reservation.seatIds,
  };
}

function sameSeats(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((seat) => b.includes(seat));
}

function isHoldingSeats(reservation: ReservationDocument, now: Date): boolean {
  if (reservation.status === "PURCHASED") return true;
  return reservation.status === "RESERVED" && new Date(reservation.expiresAt) > now;
}

/**
 * Check-and-insert runs without awaiting, so concurrent requests cannot interleave.
 * An identical request (same email and seats) returns the existing reservation.
 */
function createReservationInMemory(candidate: ReservationDocument): CreateReservationResponse {
  const store = getMemoryStore();
  const now = new Date();
  const holding = store.reservations.filter(
    (r) => r.eventId === candidate.eventId && isHoldingSeats(r, now)
  );

  const duplicate = holding.find(
    (r) =>
      r.status === "RESERVED" &&
      r.email === candidate.email &&
      sameSeats(r.seatIds, candidate.seatIds)
  );
  if (duplicate) return toReservationResponse(duplicate);

  if (holding.some((r) => r.seatIds.some((seat) => candidate.seatIds.includes(seat)))) {
    throw new Error("SEAT_ALREADY_TAKEN");
  }

  store.reservations.push(candidate);
  return toReservationResponse(candidate);
}

// Expired locks are only taken over after this grace period so a purchase racing the expiry can finish
const SEAT_LOCK_TAKEOVER_GRACE_MS = 5000;

function isDuplicateKeyError(error: unknown): boolean {
  return (error as { code?: number } | null)?.code === 11000;
}

/**
 * Acquires one lock document per seat (in sorted order) via conditional upsert; a held,
 * unexpired lock makes the upsert collide on _id, which MongoDB rejects atomically.
 */
async function createReservationInMongo(
  db: Db,
  candidate: ReservationDocument
): Promise<CreateReservationResponse> {
  const locks = db.collection<SeatLockDocument>("seatLocks");
  const reservations = db.collection<ReservationDocument>("reservations");
  const now = new Date();
  const takeoverBefore = new Date(now.getTime() - SEAT_LOCK_TAKEOVER_GRACE_MS);
  const acquired: string[] = [];

  try {
    for (const seatId of candidate.seatIds) {
      const lockId = `${candidate.eventId}:${seatId}`;
      try {
        await locks.findOneAndUpdate(
          { _id: lockId, status: "RESERVED", expiresAt: { $lte: takeoverBefore } },
          {
            $set: {
              eventId: candidate.eventId,
              seatId,
              reservationId: candidate._id,
              email: candidate.email,
              seatIds: candidate.seatIds,
              code: candidate.code,
              status: "RESERVED",
              expiresAt: new Date(candidate.expiresAt),
            },
          },
          { upsert: true }
        );
        acquired.push(lockId);
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;

        if (acquired.length === 0) {
          const holder = await locks.findOne({ _id: lockId });
          if (
            holder &&
            holder.status === "RESERVED" &&
            holder.expiresAt > now &&
            holder.email === candidate.email &&
            sameSeats(holder.seatIds, candidate.seatIds)
          ) {
            return {
              reservationId: holder.reservationId,
              expiresAt: holder.expiresAt.toISOString(),
              code: holder.code,
              seatIds: holder.seatIds,
            };
          }
        }
        throw new Error("SEAT_ALREADY_TAKEN");
      }
    }

    // Guards against reservations that were stored before seat locks existed
    const conflicting = await reservations.findOne({
      _id: { $ne: candidate._id },
      eventId: candidate.eventId,
      seatIds: { $in: candidate.seatIds },
      $or: [{ status: "PURCHASED" }, { status: "RESERVED", expiresAt: { $gt: now } }],
    });
    if (conflicting) throw new Error("SEAT_ALREADY_TAKEN");

    await reservations.insertOne(candidate);
    return toReservationResponse(candidate);
  } catch (error) {
    if (acquired.length > 0) {
      await locks.deleteMany({ _id: { $in: acquired }, reservationId: candidate._id });
    }
    throw error;
  }
}

declare global {
  var _cinemaIndexesPromise: Promise<void> | undefined;
}

function ensureIndexes(db: Db): Promise<void> {
  if (!global._cinemaIndexesPromise) {
    const reservations = db.collection<ReservationDocument>("reservations");
    global._cinemaIndexesPromise = Promise.all([
      reservations.createIndex({ eventId: 1, status: 1, expiresAt: 1 }),
      reservations.createIndex({ code: 1 }),
    ])
      .then(() => undefined)
      .catch((error) => {
        global._cinemaIndexesPromise = undefined;
        console.warn("[MongoDB] Failed to create indexes:", error);
      });
  }
  return global._cinemaIndexesPromise;
}

/**
 * Purchases a reservation and confirms the ticket.
 * Idempotent: purchasing an already purchased reservation returns the same code.
 * Fails if reservation does not exist or has expired.
 */
export async function purchaseReservation(idOrCode: string): Promise<{ code: string }> {
  const db = await getDb();
  const now = new Date();
  return db ? purchaseReservationInMongo(db, idOrCode, now) : purchaseReservationInMemory(idOrCode, now);
}

function purchaseReservationInMemory(idOrCode: string, now: Date): { code: string } {
  const reservation = getMemoryStore().reservations.find(
    (r) => r._id === idOrCode || r.code === idOrCode
  );
  if (!reservation) {
    throw new Error("RESERVATION_NOT_FOUND");
  }

  if (reservation.status === "PURCHASED") {
    return { code: reservation.code };
  }

  if (reservation.status === "EXPIRED" || new Date(reservation.expiresAt) <= now) {
    reservation.status = "EXPIRED";
    throw new Error("RESERVATION_EXPIRED");
  }

  reservation.status = "PURCHASED";
  reservation.purchasedAt = now;
  return { code: reservation.code };
}

/**
 * RESERVED -> PURCHASED happens in a single conditional update, so concurrent purchases
 * and expiry cannot interleave with it; only one caller performs the transition.
 */
async function purchaseReservationInMongo(
  db: Db,
  idOrCode: string,
  now: Date
): Promise<{ code: string }> {
  const reservations = db.collection<ReservationDocument>("reservations");
  const match = { $or: [{ _id: idOrCode }, { code: idOrCode }] };

  const purchased = await reservations.findOneAndUpdate(
    { ...match, status: "RESERVED", expiresAt: { $gt: now } },
    { $set: { status: "PURCHASED", purchasedAt: now } },
    { returnDocument: "after" }
  );

  if (purchased) {
    await db
      .collection<SeatLockDocument>("seatLocks")
      .updateMany({ reservationId: purchased._id }, { $set: { status: "PURCHASED" } });
    return { code: purchased.code };
  }

  const existing = await reservations.findOne(match);
  if (!existing) {
    throw new Error("RESERVATION_NOT_FOUND");
  }

  if (existing.status === "PURCHASED") {
    return { code: existing.code };
  }

  await reservations.updateOne(
    { _id: existing._id, status: "RESERVED", expiresAt: { $lte: now } },
    { $set: { status: "EXPIRED" } }
  );
  throw new Error("RESERVATION_EXPIRED");
}

/**
 * Retrieves a reservation with associated event details.
 */
export async function getReservationDetails(idOrCode: string): Promise<{
  reservation: ReservationDocument;
  event: EventDocument | null;
  isExpired: boolean;
} | null> {
  const db = await getDb();
  let reservation: ReservationDocument | null = null;

  if (db) {
    reservation = await db.collection<ReservationDocument>("reservations").findOne({
      $or: [{ _id: idOrCode }, { code: idOrCode }],
    });
  } else {
    reservation =
      getMemoryStore().reservations.find(
        (r) => r._id === idOrCode || r.code === idOrCode
      ) ?? null;
  }

  if (!reservation) {
    return null;
  }

  const now = new Date();
  const expiryDate = new Date(reservation.expiresAt);
  const isExpired = reservation.status !== "PURCHASED" && expiryDate <= now;

  const event = await getEventById(reservation.eventId);

  return {
    reservation,
    event,
    isExpired,
  };
}
