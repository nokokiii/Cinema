// GET /api/events - Returns the list of all cinema screenings/events
import { NextResponse } from "next/server";
import { getAllEvents } from "@/app/lib/events-service";
import { enforceRateLimit } from "@/app/lib/rate-limit";

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "events");
  if (limited) return limited;

  try {
    const events = await getAllEvents();
    return NextResponse.json(events);
  } catch (error) {
    console.error("Failed to fetch events:", error);
    return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
  }
}
