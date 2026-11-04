// Cached event reads for routes and pages; screenings change rarely, seat availability is never cached
import { cacheLife, cacheTag } from "next/cache";
import { getAllEvents } from "./events-service";
import { EventDocument } from "./types";

export const EVENTS_CACHE_TAG = "events";

export async function getCachedEvents(): Promise<EventDocument[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(EVENTS_CACHE_TAG);
  return getAllEvents();
}

// Looked up in the cached list so arbitrary ids cannot create extra cache entries
export async function getCachedEventById(eventId: string): Promise<EventDocument | null> {
  const events = await getCachedEvents();
  return events.find((event) => event._id === eventId) ?? null;
}
