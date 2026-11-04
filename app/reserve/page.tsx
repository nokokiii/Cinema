// Reservation page (Karta B & C: Formularz rezerwacji, licznik czasu oraz zakup)
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { getEventById } from "@/app/lib/events-service";
import { parseSeatsParam } from "@/app/lib/seats";
import ReserveFormClient from "./reserve-form-client";

export const instant = false;

async function ReserveContent({
  eventId,
  seats,
}: {
  eventId?: string;
  seats?: string;
}) {
  await connection();

  const seatIds = parseSeatsParam(seats);

  if (!eventId || seatIds.length === 0) {
    return (
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-xl">
        <div className="text-4xl mb-4">⚠️</div>
        <h1 className="text-xl font-bold mb-2">Brak danych rezerwacji</h1>
        <p className="text-slate-400 text-sm mb-6">
          Nie wybrano seansu lub miejsca do rezerwacji.
        </p>
        <Link
          href="/"
          className="inline-block px-5 py-2.5 rounded-xl font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors"
        >
          Wróć do repertuaru
        </Link>
      </div>
    );
  }

  const event = await getEventById(eventId);

  if (!event) {
    return (
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-xl">
        <div className="text-4xl mb-4">❌</div>
        <h1 className="text-xl font-bold mb-2">Seans nie został znaleziony</h1>
        <p className="text-slate-400 text-sm mb-6">
          Wybrany seans nie istnieje w systemie.
        </p>
        <Link
          href="/"
          className="inline-block px-5 py-2.5 rounded-xl font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors"
        >
          Wróć do repertuaru
        </Link>
      </div>
    );
  }

  return <ReserveFormClient event={event} seatIds={seatIds} />;
}

export default async function ReservePage({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string; seats?: string }>;
}) {
  const { eventId, seats } = await searchParams;

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
            href={eventId ? `/events/${eventId}` : "/"}
            className="text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-1"
          >
            &larr; Wróć
          </Link>
        </div>
      </header>

      {/* Main Reservation Container */}
      <main className="flex-1 max-w-xl w-full mx-auto px-4 py-12 flex flex-col items-center">
        <Suspense
          fallback={
            <div className="w-full h-80 bg-slate-900 border border-slate-800 rounded-3xl animate-pulse flex items-center justify-center text-slate-500">
              Ładowanie danych rezerwacji...
            </div>
          }
        >
          <ReserveContent eventId={eventId} seats={seats} />
        </Suspense>
      </main>
    </div>
  );
}
