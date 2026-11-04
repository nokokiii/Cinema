// Uniform `{ error }` JSON responses for API routes
import { NextResponse } from "next/server";

const SERVICE_ERRORS: Record<string, { status: number; error: string }> = {
  EVENT_NOT_FOUND: { status: 404, error: "Event not found" },
  SEAT_INVALID: { status: 400, error: "Invalid seats for this screening" },
  SEAT_ALREADY_TAKEN: { status: 409, error: "Seat is already reserved or purchased" },
  RESERVATION_NOT_FOUND: { status: 404, error: "Reservation not found" },
  RESERVATION_EXPIRED: { status: 410, error: "Reservation expired, seat returned to pool" },
};

export function apiError(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status });
}

/**
 * Maps known service errors to their HTTP response; anything else is logged and becomes a 500.
 */
export function serviceErrorResponse(error: unknown, fallbackMessage: string): NextResponse {
  const known = error instanceof Error ? SERVICE_ERRORS[error.message] : undefined;
  if (known) return apiError(known.status, known.error);

  console.error(`${fallbackMessage}:`, error);
  return apiError(500, fallbackMessage);
}
