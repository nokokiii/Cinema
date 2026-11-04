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
