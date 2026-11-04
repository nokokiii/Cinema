// GET /api/reservations/:id - Retrieves reservation details with event information
import { NextResponse } from "next/server";
import { getReservationDetails } from "@/app/lib/events-service";
import { enforceRateLimit } from "@/app/lib/rate-limit";
import { isValidReservationIdOrCode } from "@/app/lib/validation";
import { apiError, serviceErrorResponse } from "@/app/lib/api-errors";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = enforceRateLimit(request, "getReservation");
  if (limited) return limited;

  const { id } = await params;
  if (!isValidReservationIdOrCode(id)) {
    return apiError(400, "Invalid reservation id format");
  }

  try {
    const details = await getReservationDetails(id);
    if (!details) {
      return apiError(404, "Reservation not found");
    }
    return NextResponse.json(details);
  } catch (error) {
    return serviceErrorResponse(error, "Failed to fetch reservation");
  }
}
