// Reservation page (Karta B & C: Formularz rezerwacji, licznik czasu oraz zakup)
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { getCachedEventById } from "@/app/lib/cached-events";
import { parseSeatsParam } from "@/app/lib/seats";
import SiteHeader from "@/app/components/site-header";
import ReserveFormClient from "./reserve-form-client";

export const instant = false;

function NoticeCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="max-w-md w-full bg-surface border border-border rounded-2xl p-8 text-center">
      <h1 className="text-lg font-semibold mb-2">{title}</h1>
      <p className="text-muted text-sm mb-6">{message}</p>
      <Link
        href="/"
        className="inline-block px-5 py-2.5 rounded-xl font-medium bg-accent hover:bg-accent/90 text-accent-foreground transition-colors"
      >
        Wróć do repertuaru
      </Link>
    </div>
  );
}

async function ReserveContent({
  eventId,
  seats,
  reservationId,
}: {
  eventId?: string;
  seats?: string;
  reservationId?: string;
}) {
  await connection();

  const seatIds = parseSeatsParam(seats);

  if (!eventId || seatIds.length === 0) {
    return (
      <NoticeCard
        title="Brak danych rezerwacji"
        message="Nie wybrano seansu lub miejsca do rezerwacji."
      />
    );
  }

  const event = await getCachedEventById(eventId);

  if (!event) {
    return (
      <NoticeCard
        title="Seans nie został znaleziony"
        message="Wybrany seans nie istnieje w systemie."
      />
    );
  }

  return (
    <ReserveFormClient
      event={event}
      seatIds={seatIds}
      initialReservationId={reservationId}
    />
  );
}

export default async function ReservePage({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string; seats?: string; reservationId?: string }>;
}) {
  const { eventId, seats, reservationId } = await searchParams;

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader backHref={eventId ? `/events/${eventId}` : "/"} />
      <main className="flex-1 max-w-xl w-full mx-auto px-6 py-12 flex flex-col items-center">
        <Suspense
          fallback={
            <div className="w-full h-80 bg-surface border border-border rounded-2xl animate-pulse" />
          }
        >
          <ReserveContent eventId={eventId} seats={seats} reservationId={reservationId} />
        </Suspense>
      </main>
    </div>
  );
}
