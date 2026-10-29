// Cinema hall seating map page (Karta A: Mapa sali)
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getEventById, getTakenSeats } from "@/app/lib/events-service";
import SeatMapClient from "./seat-map-client";

export const instant = false;

async function EventDetailsContent({ eventId }: { eventId: string }) {
  await connection();
  const event = await getEventById(eventId);

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
  const timeFormatted = date.toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <>
      {/* Screening Summary Header */}
      <div className="w-full text-center mb-8">
        <div className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-amber-400/10 text-amber-300 border border-amber-400/20 mb-2">
          {event.hall}
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2">
          {event.title}
        </h1>
        <p className="text-slate-400 text-sm sm:text-base capitalize">
          {dateFormatted} &bull; Godzina {timeFormatted}
          {event.durationMinutes && ` (${event.durationMinutes} min)`}
        </p>
      </div>

      {/* Interactive Cinema Hall Seat Map */}
      <SeatMapClient
        eventId={event._id}
        hallName={event.hall}
        allSeats={event.seats}
        initialTakenSeats={takenSeats}
      />
    </>
  );
}

function EventDetailsSkeleton() {
  return (
    <div className="w-full flex flex-col items-center animate-pulse">
      <div className="h-8 w-64 bg-slate-800 rounded-lg mb-4"></div>
      <div className="h-4 w-48 bg-slate-800/60 rounded mb-12"></div>
      <div className="h-96 w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl"></div>
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="text-2xl">🎬</span>
            <span className="font-bold text-xl tracking-tight text-amber-400 group-hover:text-amber-300 transition-colors">
              Kino Gwiazda
            </span>
          </Link>
          <Link
            href="/"
            className="text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-1"
          >
            &larr; Wróć do repertuaru
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 flex flex-col items-center">
        <Suspense fallback={<EventDetailsSkeleton />}>
          <EventDetailsContent eventId={id} />
        </Suspense>
      </main>
    </div>
  );
}
