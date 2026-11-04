// GET /api/events/:id - Returns event details and taken seats list
import { NextResponse } from "next/server";
import { getTakenSeats } from "@/app/lib/events-service";
import { getCachedEventById } from "@/app/lib/cached-events";
import { enforceRateLimit } from "@/app/lib/rate-limit";
import { isValidEventId } from "@/app/lib/validation";
import { apiError, serviceErrorResponse } from "@/app/lib/api-errors";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = enforceRateLimit(request, "events");
  if (limited) return limited;

  const { id } = await params;
  if (!isValidEventId(id)) {
    return apiError(400, "Invalid event id format");
  }

  try {
    const event = await getCachedEventById(id);
    if (!event) {
      return apiError(404, "Event not found");
    }

    const takenSeats = await getTakenSeats(id);

    return NextResponse.json({
      event,
      takenSeats,
    });
  } catch (error) {
    return serviceErrorResponse(error, "Failed to fetch event");
  }
}
