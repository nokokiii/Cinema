"use client";

// Interactive Cinema Seat Map component (Rows A-H, Seats 1-10)
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_SEATS_PER_RESERVATION } from "@/app/lib/seats";

interface SeatMapClientProps {
  eventId: string;
  allSeats: string[];
  initialTakenSeats: string[];
}

export default function SeatMapClient({
  eventId,
  allSeats,
  initialTakenSeats,
}: SeatMapClientProps) {
  const router = useRouter();
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);

  const rows = ["A", "B", "C", "D", "E", "F", "G", "H"];

  const parseSeat = (seatId: string) => ({
    row: seatId.charAt(0),
    number: seatId.slice(1),
  });

  const handleSeatClick = (seatId: string) => {
    if (initialTakenSeats.includes(seatId)) return;
    setSelectedSeats((current) => {
      if (current.includes(seatId)) return current.filter((s) => s !== seatId);
      if (current.length >= MAX_SEATS_PER_RESERVATION) return current;
      return [...current, seatId];
    });
  };

  const handleProceedToReservation = () => {
    if (selectedSeats.length === 0) return;
    router.push(
      `/reserve?eventId=${encodeURIComponent(eventId)}&seats=${encodeURIComponent(selectedSeats.join(","))}`
    );
  };

  const limitReached = selectedSeats.length >= MAX_SEATS_PER_RESERVATION;

  return (
    <div className="w-full flex flex-col items-center">
      <div className="flex items-center justify-center gap-6 mb-8 text-xs text-muted">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-surface border border-border" />
          Wolne
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-accent" />
          Wybrane
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-surface/40 border border-border" />
          Zajęte
        </div>
      </div>

      <div className="w-full max-w-xl mb-10">
        <div className="h-1 bg-accent/30 rounded-full" />
        <div className="text-center text-xs uppercase tracking-[0.3em] text-muted mt-2">
          Ekran
        </div>
      </div>

      <div className="bg-surface border border-border p-5 sm:p-7 rounded-2xl overflow-x-auto max-w-full">
        <div className="min-w-[460px] space-y-2.5">
          {rows.map((rowLetter) => {
            const rowSeats = allSeats.filter((s) => s.startsWith(rowLetter));

            return (
              <div key={rowLetter} className="flex items-center justify-center gap-2.5">
                <div className="w-5 text-center text-xs text-muted">{rowLetter}</div>
                <div className="flex items-center gap-2">
                  {rowSeats.map((seatId) => {
                    const isTaken = initialTakenSeats.includes(seatId);
                    const isSelected = selectedSeats.includes(seatId);
                    const { number } = parseSeat(seatId);

                    return (
                      <button
                        key={seatId}
                        type="button"
                        onClick={() => handleSeatClick(seatId)}
                        disabled={isTaken}
                        aria-label={`Rząd ${rowLetter}, Miejsce ${number}${isTaken ? " (Zajęte)" : ""}`}
                        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center text-[11px] font-medium transition-colors ${
                          isTaken
                            ? "bg-surface/40 text-muted/50 cursor-not-allowed"
                            : isSelected
                            ? "bg-accent text-accent-foreground font-bold"
                            : "bg-background text-muted border border-border hover:border-accent/60 hover:text-foreground cursor-pointer"
                        }`}
                      >
                        {number}
                      </button>
                    );
                  })}
                </div>
                <div className="w-5 text-center text-xs text-muted">{rowLetter}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="w-full max-w-md mt-8 p-4 bg-surface border border-border rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
        {selectedSeats.length > 0 ? (
          <>
            <div className="text-center sm:text-left">
              <div className="text-xs text-muted">
                Wybrane ({selectedSeats.length}/{MAX_SEATS_PER_RESERVATION})
              </div>
              <div className="font-mono font-medium">{selectedSeats.join(", ")}</div>
              {limitReached && (
                <div className="text-xs text-accent mt-1">Osiągnięto limit miejsc.</div>
              )}
            </div>
            <button
              type="button"
              onClick={handleProceedToReservation}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-medium bg-accent hover:bg-accent/90 text-accent-foreground transition-colors cursor-pointer"
            >
              Przejdź do rezerwacji
            </button>
          </>
        ) : (
          <div className="w-full text-center text-muted text-sm py-1">
            Kliknij wolne miejsca (maks. {MAX_SEATS_PER_RESERVATION}).
          </div>
        )}
      </div>
    </div>
  );
}
