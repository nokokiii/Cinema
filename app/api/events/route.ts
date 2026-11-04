// GET /api/events - Returns the list of all cinema screenings/events
import { NextResponse } from "next/server";
import { getCachedEvents } from "@/app/lib/cached-events";
import { enforceRateLimit } from "@/app/lib/rate-limit";
import { serviceErrorResponse } from "@/app/lib/api-errors";

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "events");
  if (limited) return limited;

  try {
    const events = await getCachedEvents();
    return NextResponse.json(events);
  } catch (error) {
    return serviceErrorResponse(error, "Failed to fetch events");
  }
}
