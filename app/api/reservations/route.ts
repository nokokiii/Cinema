// POST /api/reservations - Reserves one or more seats for 15 minutes (or 2 minutes in testing)
import { NextResponse } from "next/server";
import { createReservation } from "@/app/lib/events-service";
import { enforceRateLimit } from "@/app/lib/rate-limit";
import { validateCreateReservationPayload } from "@/app/lib/validation";
import { apiError, serviceErrorResponse } from "@/app/lib/api-errors";

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "createReservation");
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "Request body must be valid JSON");
  }

  const validation = validateCreateReservationPayload(body);
  if (!validation.ok) {
    return apiError(400, validation.error);
  }

  try {
    const result = await createReservation(validation.value);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return serviceErrorResponse(error, "Failed to create reservation");
  }
}
