// GET /api/events - Returns the list of all cinema screenings/events
import { NextResponse } from "next/server";
import { getAllEvents } from "@/app/lib/events-service";

export async function GET() {
  try {
    const events = await getAllEvents();
    return NextResponse.json(events);
  } catch (error) {
    console.error("Failed to fetch events:", error);
    return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
  }
}
