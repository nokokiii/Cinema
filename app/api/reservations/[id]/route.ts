// GET /api/reservations/:id - Retrieves reservation details with event information
import { NextResponse } from "next/server";
import { getReservationDetails } from "@/app/lib/events-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const details = await getReservationDetails(id);

    if (!details) {
      return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    }

    return NextResponse.json(details);
  } catch (error) {
    console.error("Failed to fetch reservation:", error);
    return NextResponse.json({ error: "Failed to fetch reservation" }, { status: 500 });
  }
}
