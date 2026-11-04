// POST /api/reservations/:id/purchase - Finalizes reservation and purchases ticket
import { NextResponse } from "next/server";
import { purchaseReservation } from "@/app/lib/events-service";
import { enforceRateLimit } from "@/app/lib/rate-limit";
import { isValidReservationIdOrCode } from "@/app/lib/validation";
import { apiError, serviceErrorResponse } from "@/app/lib/api-errors";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = enforceRateLimit(request, "purchase");
  if (limited) return limited;

  const { id } = await params;
  if (!isValidReservationIdOrCode(id)) {
    return apiError(400, "Invalid reservation id format");
  }

  try {
    const result = await purchaseReservation(id);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return serviceErrorResponse(error, "Failed to purchase reservation");
  }
}
