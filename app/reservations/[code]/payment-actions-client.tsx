"use client";

// Karta C: keeps a held (unpaid) reservation's page live and lets the customer
// (re)start payment without needing to go back through the seat map.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 3000;

export default function PaymentActionsClient({ reservationId }: { reservationId: string }) {
  const router = useRouter();
  const [isPaying, setIsPaying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-refresh while the payment may complete in another tab/webhook, so the
  // ticket appears on its own instead of requiring a manual reload.
  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [router]);

  const handlePay = async () => {
    setIsPaying(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/reservations/${encodeURIComponent(reservationId)}/checkout`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setErrorMessage(data.error || "Nie udało się uruchomić płatności Stripe.");
        setIsPaying(false);
        return;
      }
      window.location.assign(data.url);
    } catch {
      setErrorMessage("Błąd połączenia. Spróbuj ponownie.");
      setIsPaying(false);
    }
  };

  return (
    <div className="pt-2 space-y-3">
      {errorMessage && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm text-center">
          {errorMessage}
        </div>
      )}
      <button
        type="button"
        onClick={handlePay}
        disabled={isPaying}
        className="w-full py-3.5 px-6 rounded-xl font-bold text-lg bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 transition-all shadow-xl shadow-amber-500/20 active:scale-[0.98] cursor-pointer"
      >
        {isPaying ? "Przekierowanie do Stripe..." : "Zapłać teraz"}
      </button>
    </div>
  );
}
