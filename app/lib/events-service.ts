// Cinema booking service supporting MongoDB with resilient in-memory fallback
import { randomBytes, randomUUID } from "crypto";
import { getDb } from "./mongodb";
import { EventDocument, ReservationDocument } from "./types";

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

    return activeReservations.map((res) => res.seatId);
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

  return activeReservations.map((res) => res.seatId);
}

/**
 * Creates a new reservation for a seat if it is free.
 */
export async function createReservation({
  eventId,
  seatId,
  customerName,
  email,
}: {
  eventId: string;
  seatId: string;
  customerName: string;
  email: string;
}): Promise<{ reservationId: string; expiresAt: string; code: string }> {
  const event = await getEventById(eventId);
  if (!event) {
    throw new Error("EVENT_NOT_FOUND");
  }

  // Validate seat exists in the event's seating plan
  if (!event.seats.includes(seatId)) {
    throw new Error("SEAT_INVALID");
  }

  const now = new Date();
  const timeoutMinutes = getReservationTimeoutMinutes();
  const expiresAt = new Date(now.getTime() + timeoutMinutes * 60 * 1000);

  // Check if seat is currently taken
  const takenSeats = await getTakenSeats(eventId);
  if (takenSeats.includes(seatId)) {
    throw new Error("SEAT_ALREADY_TAKEN");
  }

  const reservationId = randomUUID();
  const code = generateTicketCode(seatId);

  const newReservation: ReservationDocument = {
    _id: reservationId,
    eventId,
    seatId,
    customerName: customerName.trim(),
    email: email.trim().toLowerCase(),
    code,
    status: "RESERVED",
    createdAt: now,
    expiresAt,
  };

  const db = await getDb();
  if (db) {
    await db.collection<ReservationDocument>("reservations").insertOne(newReservation);
  } else {
    getMemoryStore().reservations.push(newReservation);
  }

  return {
    reservationId,
    expiresAt: expiresAt.toISOString(),
    code,
  };
}

/**
 * Purchases a reservation and confirms the ticket.
 * Fails if reservation does not exist or has expired.
 */
export async function purchaseReservation(idOrCode: string): Promise<{ code: string }> {
  const now = new Date();
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
    throw new Error("RESERVATION_NOT_FOUND");
  }

  // If already purchased, return the existing ticket code
  if (reservation.status === "PURCHASED") {
    return { code: reservation.code };
  }

  // Check if expired
  const expiryDate = new Date(reservation.expiresAt);
  if (expiryDate <= now || reservation.status === "EXPIRED") {
    if (db) {
      await db.collection<ReservationDocument>("reservations").updateOne(
        { _id: reservation._id },
        { $set: { status: "EXPIRED" } }
      );
    } else {
      reservation.status = "EXPIRED";
    }
    throw new Error("RESERVATION_EXPIRED");
  }

  // Confirm purchase
  if (db) {
    await db.collection<ReservationDocument>("reservations").updateOne(
      { _id: reservation._id },
      {
        $set: {
          status: "PURCHASED",
          purchasedAt: now,
        },
      }
    );
  } else {
    reservation.status = "PURCHASED";
    reservation.purchasedAt = now;
  }

  return { code: reservation.code };
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
