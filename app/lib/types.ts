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
}

export interface PurchaseResponse {
  code: string;
}
