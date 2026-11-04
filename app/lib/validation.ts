// Request validation for API routes - rejects malformed input before it reaches the database
import { MAX_SEATS_PER_RESERVATION } from "./seats";

const EVENT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EVENT_ID_MAX_LENGTH = 64;
const SEAT_ID_PATTERN = /^[A-Z][1-9][0-9]?$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TICKET_CODE_PATTERN = /^TKT-[A-Z0-9]{1,4}-[0-9A-F]{6}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX_LENGTH = 254;
const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 100;

const RESERVATION_FIELDS = new Set(["eventId", "seatId", "seatIds", "customerName", "email"]);

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function isValidEventId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= EVENT_ID_MAX_LENGTH &&
    EVENT_ID_PATTERN.test(value)
  );
}

/**
 * Accepts a reservation UUID or a ticket code (e.g. TKT-A1-1F2E3D).
 */
export function isValidReservationIdOrCode(value: unknown): value is string {
  return typeof value === "string" && (UUID_PATTERN.test(value) || TICKET_CODE_PATTERN.test(value));
}

export interface CreateReservationInput {
  eventId: string;
  seatIds: string[];
  customerName: string;
  email: string;
}

export function validateCreateReservationPayload(
  body: unknown
): ValidationResult<CreateReservationInput> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Request body must be a JSON object" };
  }

  const payload = body as Record<string, unknown>;

  const unknownFields = Object.keys(payload).filter((key) => !RESERVATION_FIELDS.has(key));
  if (unknownFields.length > 0) {
    return { ok: false, error: `Unknown fields: ${unknownFields.join(", ")}` };
  }

  const { eventId, seatId, seatIds, customerName, email } = payload;

  if (eventId === undefined || customerName === undefined || email === undefined ||
      (seatId === undefined && seatIds === undefined)) {
    return {
      ok: false,
      error: "Missing required fields: eventId, seatId (or seatIds), customerName, email",
    };
  }

  if (!isValidEventId(eventId)) {
    return { ok: false, error: "Invalid eventId format" };
  }

  if (seatId !== undefined && seatIds !== undefined) {
    return { ok: false, error: "Provide either seatId or seatIds, not both" };
  }

  let requestedSeats: unknown[];
  if (seatIds !== undefined) {
    if (!Array.isArray(seatIds)) {
      return { ok: false, error: "seatIds must be an array of seat identifiers" };
    }
    requestedSeats = seatIds;
  } else {
    requestedSeats = [seatId];
  }

  if (requestedSeats.length === 0 || requestedSeats.length > MAX_SEATS_PER_RESERVATION) {
    return {
      ok: false,
      error: `A reservation must contain between 1 and ${MAX_SEATS_PER_RESERVATION} seats`,
    };
  }

  if (!requestedSeats.every((s) => typeof s === "string" && SEAT_ID_PATTERN.test(s))) {
    return { ok: false, error: "Invalid seat identifier format" };
  }

  const normalizedSeats = [...new Set(requestedSeats as string[])];
  if (normalizedSeats.length !== requestedSeats.length) {
    return { ok: false, error: "Duplicate seats in request" };
  }

  if (typeof customerName !== "string") {
    return { ok: false, error: "customerName must be a string" };
  }
  const trimmedName = customerName.trim();
  if (trimmedName.length < NAME_MIN_LENGTH || trimmedName.length > NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `customerName must be between ${NAME_MIN_LENGTH} and ${NAME_MAX_LENGTH} characters`,
    };
  }

  if (typeof email !== "string") {
    return { ok: false, error: "email must be a string" };
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(normalizedEmail)) {
    return { ok: false, error: "Invalid email address" };
  }

  return {
    ok: true,
    value: {
      eventId,
      seatIds: normalizedSeats,
      customerName: trimmedName,
      email: normalizedEmail,
    },
  };
}
