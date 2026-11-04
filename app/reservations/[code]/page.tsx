// Ticket confirmation page (Karta C: Ekran biletu z kodem)
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { getReservationDetails } from "@/app/lib/events-service";
import { isValidReservationIdOrCode } from "@/app/lib/validation";

export const instant = false;

async function TicketContent({ code }: { code: string }) {
  await connection();
  const decodedCode = decodeURIComponent(code);
  const details = isValidReservationIdOrCode(decodedCode)
    ? await getReservationDetails(decodedCode)
    : null;

  if (!details) {
    return (
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-xl">
        <div className="text-4xl mb-4">🔍</div>
        <h1 className="text-xl font-bold mb-2">Bilet nie został znaleziony</h1>
        <p className="text-slate-400 text-sm mb-6">
          Nie odnaleziono biletu o podanym kodzie ({decodedCode}).
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

  const { reservation, event, isExpired } = details;

  const seatList = reservation.seatIds.join(", ");

  const screeningDate = event ? new Date(event.startsAt) : null;
  const formattedDate = screeningDate
    ? screeningDate.toLocaleDateString("pl-PL", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";
  const formattedTime = screeningDate
    ? screeningDate.toLocaleTimeString("pl-PL", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  if (isExpired) {
    return (
      <div className="w-full bg-slate-900 border border-rose-500/30 rounded-3xl p-8 text-center shadow-2xl">
        <div className="text-5xl mb-4">⌛</div>
        <h1 className="text-2xl font-bold text-rose-400 mb-2">
          Rezerwacja wygasła, fotel wrócił do puli
        </h1>
        <p className="text-slate-400 text-sm mb-6">
          Czas ważności rezerwacji ({seatList}) minął przed opłaceniem.
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 rounded-xl font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors"
        >
          Wróć do repertuaru
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl relative">
      {/* Ticket Top Banner */}
      <div className="bg-amber-500 p-6 text-slate-950 flex items-center justify-between">
        <div>
          <span className="text-xs uppercase font-extrabold tracking-wider opacity-80">
            {reservation.status === "PURCHASED" ? "Bilet Elektroniczny" : "Potwierdzenie Rezerwacji"}
          </span>
          <h1 className="text-2xl font-black tracking-tight">Kino</h1>
        </div>
        <div className="text-right">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-950 text-amber-400">
            {reservation.status === "PURCHASED" ? "KUPIONY" : "ZAREZERWOWANY"}
          </span>
        </div>
      </div>

      {/* Ticket Perforation effect */}
      <div className="relative flex items-center justify-between px-2 -my-3 z-10">
        <div className="w-6 h-6 rounded-full bg-slate-950 -ml-5 border-r border-slate-800"></div>
        <div className="flex-1 border-t-2 border-dashed border-slate-800 mx-2"></div>
        <div className="w-6 h-6 rounded-full bg-slate-950 -mr-5 border-l border-slate-800"></div>
      </div>

      {/* Ticket Body */}
      <div className="p-6 sm:p-8 space-y-6">
        <div>
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Film</div>
          <h2 className="text-2xl font-bold text-white">
            {event ? event.title : "Seans filmowy"}
          </h2>
          {event?.hall && (
            <div className="text-sm text-amber-400 font-medium mt-0.5">
              {event.hall}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80">
          <div>
            <div className="text-xs text-slate-400 mb-1">Data</div>
            <div className="text-sm font-semibold text-white capitalize">{formattedDate}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Godzina</div>
            <div className="text-sm font-semibold text-white">{formattedTime}</div>
          </div>
          <div className="col-span-2">
            <div className="text-xs text-slate-400 mb-1">
              {reservation.seatIds.length > 1
                ? `Miejsca (${reservation.seatIds.length})`
                : "Miejsce"}
            </div>
            <div className="text-base font-bold text-amber-400 font-mono">{seatList}</div>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-4 flex flex-col items-center justify-center text-center">
          <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">Kod Biletu</div>
          <div className="text-2xl font-extrabold font-mono text-amber-400 tracking-wider bg-slate-950 px-4 py-2 rounded-xl border border-amber-500/30">
            {reservation.code}
          </div>
          <div className="text-xs text-slate-500 mt-2">
            Widz: {reservation.customerName} &bull; {reservation.email}
          </div>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-3">
          <Link
            href="/"
            className="w-full text-center py-3 px-4 rounded-xl font-semibold bg-slate-800 hover:bg-slate-700 text-white transition-colors"
          >
            Wróć do repertuaru
          </Link>
        </div>
      </div>
    </div>
  );
}

export default async function ReservationConfirmationPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

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
            Repertuar
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-xl w-full mx-auto px-4 py-12 flex flex-col items-center">
        <Suspense
          fallback={
            <div className="w-full h-80 bg-slate-900 border border-slate-800 rounded-3xl animate-pulse flex items-center justify-center text-slate-500">
              Ładowanie danych biletu...
            </div>
          }
        >
          <TicketContent code={code} />
        </Suspense>
      </main>
    </div>
  );
}
