// Ticket confirmation page (Karta C: Ekran biletu z kodem)
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { getReservationDetails } from "@/app/lib/events-service";
import { isValidReservationIdOrCode } from "@/app/lib/validation";
import SiteHeader from "@/app/components/site-header";
import PaymentActionsClient from "./payment-actions-client";

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

async function TicketContent({ code }: { code: string }) {
  await connection();
  const decodedCode = decodeURIComponent(code);
  const details = isValidReservationIdOrCode(decodedCode)
    ? await getReservationDetails(decodedCode)
    : null;

  if (!details) {
    return (
      <NoticeCard
        title="Bilet nie został znaleziony"
        message={`Nie odnaleziono biletu o podanym kodzie (${decodedCode}).`}
      />
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
    ? screeningDate.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })
    : "";

  if (isExpired) {
    return (
      <NoticeCard
        title="Rezerwacja wygasła, fotel wrócił do puli"
        message={`Czas ważności rezerwacji (${seatList}) minął przed opłaceniem.`}
      />
    );
  }

  return (
    <div className="w-full bg-surface border border-border rounded-2xl overflow-hidden">
      {/* Ticket Top Banner */}
      <div className="bg-accent p-6 text-accent-foreground flex items-center justify-between">
        <div>
          <span className="text-xs uppercase font-semibold tracking-wider opacity-80">
            {reservation.status === "PURCHASED" ? "Bilet elektroniczny" : "Potwierdzenie rezerwacji"}
          </span>
          <h1 className="text-xl font-bold tracking-tight">Kino Gwiazda</h1>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-background text-accent">
          {reservation.status === "PURCHASED" ? "KUPIONY" : "ZAREZERWOWANY"}
        </span>
      </div>

      {/* Ticket Body */}
      <div className="p-6 sm:p-8 space-y-6">
        <div>
          <div className="text-xs text-muted uppercase tracking-wider mb-1">Film</div>
          <h2 className="text-xl font-semibold">{event ? event.title : "Seans filmowy"}</h2>
          {event?.hall && <div className="text-sm text-accent mt-0.5">{event.hall}</div>}
        </div>

        <div className="grid grid-cols-2 gap-4 bg-background p-4 rounded-xl border border-border">
          <div>
            <div className="text-xs text-muted mb-1">Data</div>
            <div className="text-sm font-medium capitalize">{formattedDate}</div>
          </div>
          <div>
            <div className="text-xs text-muted mb-1">Godzina</div>
            <div className="text-sm font-medium">{formattedTime}</div>
          </div>
          <div className="col-span-2">
            <div className="text-xs text-muted mb-1">
              {reservation.seatIds.length > 1 ? `Miejsca (${reservation.seatIds.length})` : "Miejsce"}
            </div>
            <div className="font-mono font-medium text-accent">{seatList}</div>
          </div>
        </div>

        <div className="border-t border-border pt-4 flex flex-col items-center justify-center text-center">
          {reservation.status === "PURCHASED" ? (
            <>
              <div className="text-xs text-muted uppercase tracking-widest mb-1">Kod biletu</div>
              <div className="text-xl font-bold font-mono tracking-wider bg-background px-4 py-2 rounded-xl border border-accent/30 text-accent">
                {reservation.code}
              </div>
            </>
          ) : (
            <div className="text-sm text-accent">
              Płatność w toku lub przerwana — dokończ zakup, zanim rezerwacja wygaśnie.
            </div>
          )}
          <div className="text-xs text-muted mt-2">
            Widz: {reservation.customerName} &bull; {reservation.email}
          </div>
        </div>

        {reservation.status === "PURCHASED" && (
          <div className="bg-background p-4 rounded-xl border border-border space-y-1.5 text-sm">
            <div className="text-xs text-muted uppercase tracking-wider mb-1">
              Podsumowanie zakupu
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Zapłacono kartą:</span>
              <span className="font-medium">
                {((reservation.amount - (reservation.pointsUsed ?? 0)) / 100).toFixed(2)} zł
              </span>
            </div>
            {Boolean(reservation.pointsUsed) && (
              <div className="flex justify-between">
                <span className="text-muted">Zapłacono punktami:</span>
                <span className="font-medium">{reservation.pointsUsed} pkt</span>
              </div>
            )}
            {Boolean(reservation.pointsEarned) && (
              <div className="flex justify-between">
                <span className="text-muted">Zebrane punkty:</span>
                <span className="font-medium text-accent">+{reservation.pointsEarned} pkt</span>
              </div>
            )}
          </div>
        )}

        {reservation.status !== "PURCHASED" && (
          <PaymentActionsClient reservationId={reservation._id} />
        )}

        <Link
          href="/"
          className="block w-full text-center py-3 px-4 rounded-xl font-medium bg-background border border-border hover:border-accent/50 transition-colors"
        >
          Wróć do repertuaru
        </Link>
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
    <div className="min-h-screen flex flex-col">
      <SiteHeader backHref="/" backLabel="Repertuar" />
      <main className="flex-1 max-w-xl w-full mx-auto px-6 py-12 flex flex-col items-center">
        <Suspense
          fallback={<div className="w-full h-80 bg-surface border border-border rounded-2xl animate-pulse" />}
        >
          <TicketContent code={code} />
        </Suspense>
      </main>
    </div>
  );
}
