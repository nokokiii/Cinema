// Seat selection helpers shared by server and client code

export const MAX_SEATS_PER_RESERVATION = 6;

/**
 * Parses a comma-separated `seats` query parameter (e.g. "A1,A2") into a unique list.
 */
export function parseSeatsParam(value: string | undefined): string[] {
  if (!value) return [];
  const seats = value
    .split(",")
    .map((seat) => seat.trim())
    .filter(Boolean);
  return [...new Set(seats)];
}
