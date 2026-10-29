// GET /api/events/:id - Returns event details and taken seats list
import { NextResponse } from "next/server";
import { getEventById, getTakenSeats } from "@/app/lib/events-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const event = await getEventById(id);

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const takenSeats = await getTakenSeats(id);

    return NextResponse.json({
      event,
      takenSeats,
    });
  } catch (error) {
    console.error("Failed to fetch event:", error);
    return NextResponse.json({ error: "Failed to fetch event" }, { status: 500 });
  }
}
