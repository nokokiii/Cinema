"use client";

// Interactive Cinema Seat Map component (Rows A-H, Seats 1-10)
import { useState } from "react";
import { useRouter } from "next/navigation";

interface SeatMapClientProps {
  eventId: string;
  hallName?: string;
  allSeats: string[];
  initialTakenSeats: string[];
}

export default function SeatMapClient({
  eventId,
  allSeats,
  initialTakenSeats,
}: SeatMapClientProps) {
  const router = useRouter();
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null);

  // Group seats by row (letter prefix)
  const rows = ["A", "B", "C", "D", "E", "F", "G", "H"];

  // Helper to parse human-readable seat representation
  const parseSeat = (seatId: string) => {
    const row = seatId.charAt(0);
    const number = seatId.slice(1);
    return { row, number };
  };

  const handleSeatClick = (seatId: string) => {
    if (initialTakenSeats.includes(seatId)) return;
    if (selectedSeat === seatId) {
      setSelectedSeat(null);
    } else {
      setSelectedSeat(seatId);
    }
  };

  const handleProceedToReservation = () => {
    if (!selectedSeat) return;
    router.push(`/reserve?eventId=${encodeURIComponent(eventId)}&seatId=${encodeURIComponent(selectedSeat)}`);
  };

  return (
    <div className="w-full flex flex-col items-center">
      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-6 mb-8 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-slate-700 border border-slate-600"></div>
          <span className="text-slate-300">Wolne</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-amber-400 border border-amber-300"></div>
          <span className="text-slate-300">Wybrane</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-slate-800/80 border border-slate-800 text-slate-600 flex items-center justify-center text-xs">
            ✕
          </div>
          <span className="text-slate-500">Zajęte</span>
        </div>
      </div>

      {/* Cinema Screen Simulation */}
      <div className="w-full max-w-2xl mb-12 flex flex-col items-center">
        <div className="w-full h-3 bg-gradient-to-b from-amber-400/60 to-transparent rounded-t-full shadow-[0_-8px_25px_rgba(251,191,36,0.35)]"></div>
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400 mt-2 font-semibold">
          Ekran
        </div>
      </div>

      {/* Seat Grid */}
      <div className="bg-slate-900/90 border border-slate-800 p-6 sm:p-8 rounded-3xl shadow-2xl overflow-x-auto max-w-full">
        <div className="min-w-[480px] space-y-3">
          {rows.map((rowLetter) => {
            // Find seats for this row, e.g. A1..A10
            const rowSeats = allSeats.filter((s) => s.startsWith(rowLetter));

            return (
              <div key={rowLetter} className="flex items-center justify-center gap-2 sm:gap-3">
                {/* Row Label */}
                <div className="w-6 text-center font-bold text-sm text-slate-400">
                  {rowLetter}
                </div>

                {/* Seats in row */}
                <div className="flex items-center gap-2 sm:gap-2.5">
                  {rowSeats.map((seatId) => {
                    const isTaken = initialTakenSeats.includes(seatId);
                    const isSelected = selectedSeat === seatId;
                    const { number } = parseSeat(seatId);

                    return (
                      <button
                        key={seatId}
                        type="button"
                        onClick={() => handleSeatClick(seatId)}
                        disabled={isTaken}
                        aria-label={`Rząd ${rowLetter}, Miejsce ${number}${isTaken ? " (Zajęte)" : ""}`}
                        className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center text-xs font-semibold transition-all duration-150 ${
                          isTaken
                            ? "bg-slate-800/80 text-slate-600 border border-slate-800 cursor-not-allowed opacity-60"
                            : isSelected
                            ? "bg-amber-400 text-slate-950 font-extrabold border-2 border-white scale-110 shadow-lg shadow-amber-400/40"
                            : "bg-slate-800 text-slate-200 border border-slate-700 hover:bg-amber-500 hover:text-slate-950 hover:border-amber-400 active:scale-95 cursor-pointer"
                        }`}
                      >
                        {number}
                      </button>
                    );
                  })}
                </div>

                {/* Right Row Label */}
                <div className="w-6 text-center font-bold text-sm text-slate-400">
                  {rowLetter}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Seat Action Bar */}
      <div className="w-full max-w-md mt-8 p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
        {selectedSeat ? (
          <>
            <div className="text-center sm:text-left">
              <div className="text-xs text-slate-400 font-medium">Wybrany fotel</div>
              <div className="text-lg font-bold text-white">
                Rząd {parseSeat(selectedSeat).row}, miejsce {parseSeat(selectedSeat).number}
                <span className="text-xs text-amber-400 ml-2 font-mono">({selectedSeat})</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleProceedToReservation}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors shadow-lg shadow-amber-500/20 active:scale-95 cursor-pointer"
            >
              Przejdź do rezerwacji &rarr;
            </button>
          </>
        ) : (
          <div className="w-full text-center text-slate-400 text-sm py-2">
            Kliknij wolny fotel na mapie, aby przejść do rezerwacji.
          </div>
        )}
      </div>
    </div>
  );
}
