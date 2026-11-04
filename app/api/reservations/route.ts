// POST /api/reservations - Reserves a seat for 15 minutes (or 2 minutes in testing)
import { NextResponse } from "next/server";
import { createReservation } from "@/app/lib/events-service";
import { enforceRateLimit } from "@/app/lib/rate-limit";

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "createReservation");
  if (limited) return limited;

  try {
    const body = await request.json();
    const { eventId, seatId, customerName, email } = body;

    // Validate required fields
    if (!eventId || !seatId || !customerName || !email) {
      return NextResponse.json(
        { error: "Missing required fields: eventId, seatId, customerName, email" },
        { status: 400 }
      );
    }

    const result = await createReservation({
      eventId: String(eventId),
      seatId: String(seatId),
      customerName: String(customerName),
      email: String(email),
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "EVENT_NOT_FOUND") {
        return NextResponse.json({ error: "Event not found" }, { status: 404 });
      }
      if (error.message === "SEAT_INVALID") {
        return NextResponse.json({ error: "Invalid seat for this screening" }, { status: 400 });
      }
      if (error.message === "SEAT_ALREADY_TAKEN") {
        return NextResponse.json(
          { error: "Seat is already reserved or purchased" },
          { status: 409 }
        );
      }
    }

    console.error("Failed to create reservation:", error);
    return NextResponse.json({ error: "Failed to create reservation" }, { status: 500 });
  }
}
