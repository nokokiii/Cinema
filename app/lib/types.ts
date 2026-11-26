// Cinema ticket booking system types

export type ReservationStatus = "RESERVED" | "PURCHASED" | "EXPIRED";

export interface EventDocument {
  _id: string;
  title: string;
  startsAt: string;
  hall: string;
  seats: string[];
  description?: string;
  durationMinutes?: number;
  genre?: string;
  // Price per seat in minor units (grosze). Falls back to STRIPE_TICKET_PRICE_MINOR when unset.
  priceMinor?: number;
}

export interface ReservationDocument {
  _id: string;
  eventId: string;
  seatIds: string[];
  customerName: string;
  email: string;
  code: string;
  status: ReservationStatus;
  createdAt: string | Date;
  expiresAt: string | Date;
  purchasedAt?: string | Date;
  // Total price in minor units, captured at reservation time and never recomputed afterwards.
  amount: number;
  // Stripe Checkout Session currently open for this reservation, if any (reused to avoid
  // creating a second payable session for the same booking).
  stripeSessionId?: string;
  // Loyalty points (Etap III). pointsUsed is committed once, at the first checkout call;
  // pointsEarned is set once the purchase webhook actually awards them.
  pointsUsed?: number;
  pointsEarned?: number;
  // Guards a one-time loyalty-points refund if a reservation with pointsUsed expires unpaid.
  pointsRefunded?: boolean;
}

// One row per customer email in the fallback (non-Voucherify) loyalty store.
export interface LoyaltyAccountDocument {
  _id: string; // email
  balance: number;
}

// One document per (event, seat); its unique _id makes seat acquisition atomic in MongoDB
export interface SeatLockDocument {
  _id: string;
  eventId: string;
  seatId: string;
  reservationId: string;
  email: string;
  seatIds: string[];
  code: string;
  status: Exclude<ReservationStatus, "EXPIRED">;
  expiresAt: Date;
  amount: number;
}

export interface EventDetailResponse {
  event: EventDocument;
  takenSeats: string[];
}

export interface CreateReservationRequest {
  eventId: string;
  seatIds: string[];
  customerName: string;
  email: string;
}

export interface CreateReservationResponse {
  reservationId: string;
  expiresAt: string;
  code: string;
  seatIds: string[];
  amount: number;
}

export interface PurchaseResponse {
  code: string;
}

// Public shape of GET /api/reservations/:id per the Etap II/III contract.
export interface ReservationStatusFields {
  status: "held" | "paid" | "expired";
  amount: number;
  expiresAt: string;
  code?: string;
  pointsUsed?: number;
  pointsEarned?: number;
}
