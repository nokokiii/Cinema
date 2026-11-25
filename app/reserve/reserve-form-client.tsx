"use client";

// Client component for reserving a seat and finalizing purchase with countdown timer
import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EventDocument } from "@/app/lib/types";

interface ReserveFormClientProps {
  event: EventDocument;
  seatIds: string[];
  initialReservationId?: string;
}

function formatPln(amountMinor: number): string {
  return `${(amountMinor / 100).toFixed(2).replace(/\.00$/, "")} zł`;
}

export default function ReserveFormClient({
  event,
  seatIds,
  initialReservationId,
}: ReserveFormClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [customerName, setCustomerName] = useState("");
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isResuming, setIsResuming] = useState(Boolean(initialReservationId));

  // Reservation state after POST /api/reservations
  const [reservation, setReservation] = useState<{
    reservationId: string;
    expiresAt: string;
    code: string;
    amount: number;
  } | null>(null);

  // Countdown timer state in seconds
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  // Etap III: loyalty points (Karta A balance lookup, Karta B spend-at-checkout)
  const [fetchedBalance, setFetchedBalance] = useState<number | null>(null);
  const [pointsToUseRaw, setPointsToUseRaw] = useState(0);
  const [pointsLocked, setPointsLocked] = useState(false);

  const isMultiSeat = seatIds.length > 1;
  const unitPrice = event.priceMinor;
  const totalPrice = reservation?.amount ?? (unitPrice !== undefined ? unitPrice * seatIds.length : 0);
  const maxRedeemablePoints = Math.floor(totalPrice / 2);
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const pointsBalance = emailLooksValid || pointsLocked ? fetchedBalance : null;
  const usablePoints = Math.max(0, Math.min(pointsBalance ?? 0, maxRedeemablePoints));
  const pointsToUse = pointsLocked ? pointsToUseRaw : Math.min(pointsToUseRaw, usablePoints);
  const amountDue = totalPrice - pointsToUse;

  // Look up the customer's points balance once they've typed a plausible e-mail (Karta A).
  useEffect(() => {
    if (pointsLocked || !emailLooksValid) return;
    const trimmed = email.trim();
    let cancelled = false;
    const timeout = setTimeout(() => {
      fetch(`/api/loyalty?email=${encodeURIComponent(trimmed)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled && data) setFetchedBalance(data.points);
        })
        .catch(() => {});
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, pointsLocked]);

  // Resume an in-flight reservation after returning from a cancelled Stripe checkout,
  // instead of making the customer fill in the form again (Etap II Karta C).
  useEffect(() => {
    if (!initialReservationId) return;

    let cancelled = false;
    fetch(`/api/reservations/${initialReservationId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (data.status === "held") {
          setReservation({
            reservationId: initialReservationId,
            expiresAt: data.expiresAt,
            code: data.reservation?.code ?? "",
            amount: data.amount,
          });
          setCustomerName(data.reservation?.customerName ?? "");
          setEmail(data.reservation?.email ?? "");
          if (data.pointsUsed !== undefined) {
            setPointsToUseRaw(data.pointsUsed);
            setPointsLocked(true);
          }
        } else if (data.status === "paid") {
          startTransition(() => {
            router.push(`/reservations/${encodeURIComponent(initialReservationId)}`);
          });
        }
      })
      .finally(() => {
        if (!cancelled) setIsResuming(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReservationId]);

  // Live countdown timer effect
  useEffect(() => {
    if (!reservation?.expiresAt) return;

    const expiryTime = new Date(reservation.expiresAt).getTime();

    const updateTimer = () => {
      const now = Date.now();
      const diffInSeconds = Math.max(0, Math.floor((expiryTime - now) / 1000));
      setSecondsRemaining(diffInSeconds);

      if (diffInSeconds <= 0) {
        setIsExpired(true);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [reservation]);

  // Handle seat reservation submit
  const handleReserve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !email.trim()) {
      setErrorMessage("Proszę podać imię i nazwisko oraz adres e-mail.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event._id,
          seatIds,
          customerName: customerName.trim(),
          email: email.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || "Nie udało się utworzyć rezerwacji.");
        setIsLoading(false);
        return;
      }

      setReservation({
        reservationId: data.reservationId,
        expiresAt: data.expiresAt,
        code: data.code,
        amount: data.amount,
      });
      setIsLoading(false);
    } catch (err) {
      console.error(err);
      setErrorMessage("Błąd połączenia. Spróbuj ponownie.");
      setIsLoading(false);
    }
  };

  // Handle final purchase (Karta C: Zakup biletu)
  const handlePurchase = async () => {
    if (!reservation || isExpired) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch(
        `/api/reservations/${encodeURIComponent(reservation.reservationId)}/checkout`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ points: pointsToUse }),
        }
      );

      const data = await res.json();
      if (res.ok) setPointsLocked(true);

      if (!res.ok) {
        if (res.status === 409 && data.code) {
          startTransition(() => {
            router.push(`/reservations/${encodeURIComponent(data.code)}`);
          });
          return;
        }
        if (res.status === 410) {
          setIsExpired(true);
          setErrorMessage("Rezerwacja wygasła, fotel wrócił do puli");
        } else if (res.status === 503) {
          setErrorMessage("Płatności Stripe nie są jeszcze skonfigurowane.");
        } else {
          setErrorMessage(data.error || "Wystąpił błąd podczas zakupu.");
        }
        setIsLoading(false);
        return;
      }

      if (!data.url) {
        setErrorMessage("Nie udało się uruchomić płatności Stripe.");
        setIsLoading(false);
        return;
      }

      window.location.assign(data.url);
    } catch (err) {
      console.error(err);
      setErrorMessage("Błąd podczas finalizacji zakupu. Spróbuj ponownie.");
      setIsLoading(false);
    }
  };

  // Format seconds to MM:SS
  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const screeningDate = new Date(event.startsAt);
  const formattedDate = screeningDate.toLocaleDateString("pl-PL", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
  const formattedTime = screeningDate.toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
      {/* Screening & Seat Details Header */}
      <div className="border-b border-slate-800 pb-6 mb-6">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-400/10 text-amber-300 border border-amber-400/20">
            {event.hall}
          </span>
          <span className="text-xs text-slate-400">
            {formattedDate}, godz. {formattedTime}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">{event.title}</h1>
        <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
          <span className="text-sm text-slate-400">
            {isMultiSeat ? `Wybrane miejsca (${seatIds.length}):` : "Wybrane miejsce:"}
          </span>
          <span className="text-base font-bold text-amber-400 font-mono">
            {seatIds.join(", ")}
          </span>
        </div>
        {unitPrice !== undefined && (
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-slate-400">
              Cena{isMultiSeat ? ` (${formatPln(unitPrice)} / miejsce)` : ""}:
            </span>
            <span className="font-bold text-white">
              {formatPln(reservation?.amount ?? unitPrice * seatIds.length)}
            </span>
          </div>
        )}
      </div>

      {isResuming && (
        <div className="text-center py-10 text-slate-400 text-sm">
          Wczytywanie rezerwacji...
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm">
          {errorMessage}
        </div>
      )}

      {/* State 3: EXPIRED */}
      {isResuming ? null : isExpired ? (
        <div className="text-center py-6">
          <div className="text-5xl mb-4">⌛</div>
          <h2 className="text-xl font-bold text-rose-400 mb-2">
            Rezerwacja wygasła, fotel wrócił do puli
          </h2>
          <p className="text-slate-400 text-sm mb-6">
            Upłynął czas na sfinalizowanie zakupu. Miejsce stało się ponownie
            dostępne dla innych widzów.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href={`/events/${event._id}`}
              className="px-5 py-2.5 rounded-xl font-semibold bg-slate-800 hover:bg-slate-700 text-white transition-colors"
            >
              Wróć do mapy sali
            </Link>
            <Link
              href="/"
              className="px-5 py-2.5 rounded-xl font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors"
            >
              Zobacz repertuar
            </Link>
          </div>
        </div>
      ) : reservation ? (
        /* State 2: HOLDING with countdown timer and "Kupuję bilet" button */
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-center">
            <div className="text-xs font-semibold uppercase tracking-wider text-amber-300 mb-1">
              Czas na dokończenie zakupu
            </div>
            <div className="text-3xl font-extrabold text-amber-400 font-mono">
              Trzymamy Twój fotel jeszcze{" "}
              {secondsRemaining !== null
                ? formatTime(secondsRemaining)
                : "--:--"}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Po upływie tego czasu rezerwacja przepadnie, a miejsce wróci do
              ogólnej puli.
            </p>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Rezerwujący:</span>
              <span className="font-medium text-white">{customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">E-mail:</span>
              <span className="font-medium text-white">{email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Kod rezerwacji:</span>
              <span className="font-mono text-amber-400">
                {reservation.code}
              </span>
            </div>
          </div>

          {/* Etap III Karta B: use points in cart */}
          {pointsBalance !== null && usablePoints > 0 && (
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <label htmlFor="pointsToUse" className="text-slate-400">
                  Użyj punktów (masz {pointsBalance}, max {usablePoints})
                </label>
                <span className="text-amber-400 font-mono">{pointsToUse} pkt</span>
              </div>
              <input
                id="pointsToUse"
                type="range"
                min={0}
                max={usablePoints}
                step={1}
                value={pointsToUse}
                disabled={pointsLocked}
                onChange={(e) => setPointsToUseRaw(Number(e.target.value))}
                className="w-full accent-amber-500 disabled:opacity-50"
              />
            </div>
          )}
          {pointsLocked && pointsToUse > 0 && (
            <div className="text-xs text-slate-400 text-center">
              {pointsToUse} pkt już odjęte od salda dla tej rezerwacji.
            </div>
          )}

          <button
            type="button"
            onClick={handlePurchase}
            disabled={isLoading || isExpired}
            className="w-full py-3.5 px-6 rounded-xl font-bold text-lg bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 transition-all shadow-xl shadow-amber-500/20 active:scale-[0.98] cursor-pointer"
          >
            {isLoading
              ? "Przekierowanie do Stripe..."
              : `Zapłać ${formatPln(amountDue)}`}
          </button>
        </div>
      ) : (
        /* State 1: FORM to create reservation */
        <form onSubmit={handleReserve} className="space-y-4">
          <div>
            <label
              htmlFor="customerName"
              className="block text-sm font-medium text-slate-300 mb-1"
            >
              Imię i nazwisko
            </label>
            <input
              id="customerName"
              type="text"
              required
              placeholder="np. Jan Kowalski"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-300 mb-1"
            >
              Adres e-mail
            </label>
            <input
              id="email"
              type="email"
              required
              placeholder="np. jan.kowalski@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
            />
            {pointsBalance !== null && (
              <p className="text-xs text-amber-400 mt-1">
                Masz {pointsBalance} punktów ({formatPln(pointsBalance)})
              </p>
            )}
          </div>

          <p className="text-xs text-slate-400">
            Po kliknięciu przycisku {isMultiSeat ? "miejsca zostaną zarezerwowane" : "miejsce zostanie zarezerwowane"} na
            15 minut. W tym czasie nikt inny nie będzie mógł {isMultiSeat ? "ich" : "go"} wybrać.
          </p>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 px-6 rounded-xl font-bold text-base bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 transition-all shadow-lg shadow-amber-500/20 active:scale-[0.98] cursor-pointer mt-2"
          >
            {isLoading
              ? "Rezerwowanie..."
              : isMultiSeat
                ? `Rezerwuj fotele (${seatIds.length})`
                : "Rezerwuj fotel"}
          </button>
        </form>
      )}
    </div>
  );
}
