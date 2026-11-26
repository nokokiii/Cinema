// Cinema hall seating map page (Karta A: Mapa sali)
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTakenSeats } from "@/app/lib/events-service";
import { getCachedEventById } from "@/app/lib/cached-events";
import SiteHeader from "@/app/components/site-header";
import SeatMapClient from "./seat-map-client";

export const instant = false;

async function EventDetailsContent({ eventId }: { eventId: string }) {
  await connection();
  const event = await getCachedEventById(eventId);

  if (!event) {
    notFound();
  }

  const takenSeats = await getTakenSeats(eventId);

  const date = new Date(event.startsAt);
  const dateFormatted = date.toLocaleDateString("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const timeFormatted = date.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <div className="mb-8">
        <div className="text-sm text-muted mb-1">
          {event.hall}
          {event.durationMinutes ? ` · ${event.durationMinutes} min` : ""}
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-1">{event.title}</h1>
        <p className="text-muted capitalize">
          {dateFormatted}, {timeFormatted}
        </p>
      </div>

      <SeatMapClient
        eventId={event._id}
        allSeats={event.seats}
        initialTakenSeats={takenSeats}
      />
    </>
  );
}

function EventDetailsSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-64 bg-surface rounded-lg" />
      <div className="h-96 w-full bg-surface border border-border rounded-2xl" />
    </div>
  );
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader backHref="/" backLabel="Repertuar" />
      <main className="max-w-3xl mx-auto w-full px-6 py-10">
        <Suspense fallback={<EventDetailsSkeleton />}>
          <EventDetailsContent eventId={id} />
        </Suspense>
      </main>
    </div>
  );
}
