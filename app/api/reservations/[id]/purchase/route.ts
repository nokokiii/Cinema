// POST /api/reservations/:id/purchase - Finalizes reservation and purchases ticket
import { NextResponse } from "next/server";
import { purchaseReservation } from "@/app/lib/events-service";
import { enforceRateLimit } from "@/app/lib/rate-limit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = enforceRateLimit(request, "purchase");
  if (limited) return limited;

  try {
    const { id } = await params;
    const result = await purchaseReservation(id);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "RESERVATION_NOT_FOUND") {
        return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
      }
      if (error.message === "RESERVATION_EXPIRED") {
        return NextResponse.json(
          { error: "Reservation expired, seat returned to pool" },
          { status: 410 }
        );
      }
    }

    console.error("Failed to purchase reservation:", error);
    return NextResponse.json({ error: "Failed to purchase reservation" }, { status: 500 });
  }
}
