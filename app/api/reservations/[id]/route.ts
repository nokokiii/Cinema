// GET /api/reservations/:id - Retrieves reservation details with event information
import { NextResponse } from "next/server";
import { getReservationDetails } from "@/app/lib/events-service";
import { enforceRateLimit } from "@/app/lib/rate-limit";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = enforceRateLimit(request, "getReservation");
  if (limited) return limited;

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
