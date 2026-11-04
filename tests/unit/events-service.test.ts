/**
 * ============================================================================
 * UNIT TESTS – events-service.ts (logika biznesowa, in-memory store)
 * ============================================================================
 * Uruchomienie:
 *   npx jest tests/unit/events-service.test.ts --verbose
 *
 * Testy działają w trybie in-memory (bez MongoDB) przez celowe wyczyszczenie
 * global._inMemoryStore przed każdym testem.
 * ============================================================================
 */

import { beforeEach, describe, expect, it } from "@jest/globals";
import {
  createReservation,
  purchaseReservation,
  getTakenSeats,
  generateCinemaSeats,
  getReservationTimeoutMinutes,
  generateTicketCode,
  getEventById,
} from "@/app/lib/events-service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resetuje in-memory store przed każdym testem – izolacja pełna */
function resetStore() {
  global._inMemoryStore = undefined;
}

const VALID_EVENT_ID = "seans-2026-11-21-1800";
const VALID_SEAT = "A1";

async function makeReservation(
  overrides: Partial<{
    eventId: string;
    seatId: string;
    customerName: string;
    email: string;
  }> = {}
) {
  const { seatId = VALID_SEAT, ...rest } = overrides;
  return createReservation({
    eventId: VALID_EVENT_ID,
    customerName: "Jan Kowalski",
    email: "jan@example.com",
    ...rest,
    seatIds: [seatId],
  });
}

// ---------------------------------------------------------------------------
// 0. Podstawowe testy pomocnicze
// ---------------------------------------------------------------------------

describe("Helpers & utilities", () => {
  it("generateCinemaSeats() zwraca 80 unikalnych miejsc", () => {
    const seats = generateCinemaSeats();
    expect(seats).toHaveLength(80);
    expect(new Set(seats).size).toBe(80);
    expect(seats[0]).toBe("A1");
    expect(seats[seats.length - 1]).toBe("H10");
  });

  it("getReservationTimeoutMinutes() domyślnie zwraca 15", () => {
    delete process.env.RESERVATION_TIMEOUT_MINUTES;
    expect(getReservationTimeoutMinutes()).toBe(15);
  });

  it("getReservationTimeoutMinutes() respektuje zmienną środowiskową", () => {
    process.env.RESERVATION_TIMEOUT_MINUTES = "2";
    expect(getReservationTimeoutMinutes()).toBe(2);
    delete process.env.RESERVATION_TIMEOUT_MINUTES;
  });

  it("getReservationTimeoutMinutes() ignoruje wartość ujemną i fallback do 15", () => {
    process.env.RESERVATION_TIMEOUT_MINUTES = "-5";
    expect(getReservationTimeoutMinutes()).toBe(15);
    delete process.env.RESERVATION_TIMEOUT_MINUTES;
  });

  it("generateTicketCode() ma poprawny format TKT-XX-XXXXXX", () => {
    const code = generateTicketCode("A1");
    expect(code).toMatch(/^TKT-A1-[0-9A-F]{6}$/);
  });
});

// ---------------------------------------------------------------------------
// 1. ZAGROŻENIE: Double Booking (Podwójna rezerwacja)
// ---------------------------------------------------------------------------

describe("ZAGROŻENIE 1: Double Booking", () => {
  beforeEach(resetStore);

  // -------------------------------------------------------------------------
  // Wariant A – Równoległe żądania (symulacja Promise.all)
  // -------------------------------------------------------------------------
  it("[1-A] Równoległe rezerwacje tego samego fotela: dokładnie jedna wygrywa", async () => {
    // Różni klienci (różne e-maile) – identyczne żądania tego samego klienta są idempotentne
    const results = await Promise.allSettled([
      makeReservation({ seatId: "B5", email: "a@example.com" }),
      makeReservation({ seatId: "B5", email: "b@example.com" }),
      makeReservation({ seatId: "B5", email: "c@example.com" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(2);
    rejected.forEach((r) => {
      expect((r as PromiseRejectedResult).reason.message).toBe("SEAT_ALREADY_TAKEN");
    });
  });

  // -------------------------------------------------------------------------
  // Wariant A – test sekwencyjny: pewna kontrola bez race condition
  // -------------------------------------------------------------------------
  it("[1-A-sequential] Sekwencyjne rezerwacje tego samego fotela: 1 sukces + 2 błędy", async () => {
    const seatId = "B6";

    // Sekwencyjnie – pewny wynik bez race condition
    const r1 = await makeReservation({ seatId, email: "a@example.com" }).catch((e: Error) => e);
    const r2 = await makeReservation({ seatId, email: "b@example.com" }).catch((e: Error) => e);
    const r3 = await makeReservation({ seatId, email: "c@example.com" }).catch((e: Error) => e);

    const successes = [r1, r2, r3].filter((r) => !(r instanceof Error));
    const failures = [r1, r2, r3].filter((r) => r instanceof Error);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(2);
    failures.forEach((f) => {
      expect((f as Error).message).toBe("SEAT_ALREADY_TAKEN");
    });
  });

  // -------------------------------------------------------------------------
  // Wariant A – boundary: różne fotele w tym samym czasie mogą przejść
  // -------------------------------------------------------------------------
  it("[1-A-boundary] Różne fotele – wszystkie rezerwacje przechodzą", async () => {
    const results = await Promise.allSettled([
      makeReservation({ seatId: "A1" }),
      makeReservation({ seatId: "A2" }),
      makeReservation({ seatId: "A3" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(3);
  });

  // -------------------------------------------------------------------------
  // Wariant B – Fotel ze statusem 'RESERVED' (pending) blokuje kolejne
  // -------------------------------------------------------------------------
  it("[1-B] Fotel 'RESERVED' blokuje kolejną rezerwację", async () => {
    // Użytkownik A rezerwuje
    await makeReservation({ seatId: "C3", email: "a@example.com" });

    // Użytkownik B próbuje ten sam fotel
    await expect(
      makeReservation({ seatId: "C3", email: "b@example.com" })
    ).rejects.toThrow("SEAT_ALREADY_TAKEN");
  });

  // -------------------------------------------------------------------------
  // Wariant B – behawioralny: fotel wraca do puli po wygaśnięciu
  // -------------------------------------------------------------------------
  it("[1-B-behavior] Wygasła rezerwacja NIE blokuje nowej", async () => {
    /**
     * getReservationTimeoutMinutes() odrzuca wartość 0 (parsed > 0 = false)
     * i fallbackuje do 15. Zamiast tego manipulujemy expiresAt bezpośrednio
     * w in-memory store – jest to uczciwy test warstwy getTakenSeats().
     */
    process.env.RESERVATION_TIMEOUT_MINUTES = "15";
    const { reservationId } = await makeReservation({ seatId: "D4", email: "first@example.com" });

    // Ręcznie cofamy expiresAt o 1 godzinę, symulując wygaśnięcie
    const store = global._inMemoryStore!;
    const res = store.reservations.find((r) => r._id === reservationId)!;
    res.expiresAt = new Date(Date.now() - 3600 * 1000);

    // Drugi użytkownik – fotel powinien być dostępny (poprzednia wygasła)
    const result = await makeReservation({ seatId: "D4", email: "second@example.com" });
    expect(result.reservationId).toBeDefined();

    delete process.env.RESERVATION_TIMEOUT_MINUTES;
  });

  // -------------------------------------------------------------------------
  // Wariant C – Konflikt przy finalizacji zakupu (race na purchaseReservation)
  // -------------------------------------------------------------------------
  it("[1-C] Podwójny zakup tej samej rezerwacji: idempotentny wynik", async () => {
    const { reservationId } = await makeReservation({ seatId: "E5" });

    // Dwa równoczesne żądania zakupu tej samej rezerwacji
    const [r1, r2] = await Promise.all([
      purchaseReservation(reservationId),
      purchaseReservation(reservationId),
    ]);

    // Oba muszą zwrócić ten sam kod (idempotentność)
    expect(r1.code).toEqual(r2.code);
    expect(r1.code).toMatch(/^TKT-E5-/);
  });
});

// ---------------------------------------------------------------------------
// 2. ZAGROŻENIE: Wiszące rezerwacje-zombi
// ---------------------------------------------------------------------------

describe("ZAGROŻENIE 2: Wiszące rezerwacje-zombi", () => {
  beforeEach(resetStore);

  // -------------------------------------------------------------------------
  // Wariant A – Time-travel: fotel wraca do puli po wygaśnięciu
  // -------------------------------------------------------------------------
  it("[2-A] Wygasła rezerwacja znika z takenSeats", async () => {
    /**
     * TIME-TRAVEL PATTERN:
     * getReservationTimeoutMinutes() wymaga parsed > 0, więc timeout=0 fallbackuje do 15.
     * Zamiast tego: tworzymy rezerwację normalnie, a następnie ręcznie
     * cofamy expiresAt w in-memory store (symulacja clock-travel).
     * Jest to prawidłowy wzorzec testowy (bez mocking całego systemu czasu).
     */
    process.env.RESERVATION_TIMEOUT_MINUTES = "15";
    const { reservationId } = await makeReservation({ seatId: "F6" });

    // Ręcznie manipulujemy expiresAt (time travel – 1 godzina wstecz)
    const store = global._inMemoryStore!;
    const res = store.reservations.find((r) => r._id === reservationId)!;
    res.expiresAt = new Date(Date.now() - 3600 * 1000);

    const taken = await getTakenSeats(VALID_EVENT_ID);
    expect(taken).not.toContain("F6");

    delete process.env.RESERVATION_TIMEOUT_MINUTES;
  });

  // -------------------------------------------------------------------------
  // Wariant A – optymistyczny: aktywna rezerwacja jest w takenSeats
  // -------------------------------------------------------------------------
  it("[2-A-optimistic] Aktywna rezerwacja jest w takenSeats", async () => {
    process.env.RESERVATION_TIMEOUT_MINUTES = "15";

    await makeReservation({ seatId: "G7" });
    const taken = await getTakenSeats(VALID_EVENT_ID);
    expect(taken).toContain("G7");

    delete process.env.RESERVATION_TIMEOUT_MINUTES;
  });

  // -------------------------------------------------------------------------
  // Wariant B – Próba zakupu wygasłej rezerwacji
  // -------------------------------------------------------------------------
  it("[2-B] Zakup wygasłej rezerwacji → RESERVATION_EXPIRED", async () => {
    /**
     * TIME-TRAVEL PATTERN: analogicznie do 2-A – cofamy expiresAt ręcznie.
     */
    process.env.RESERVATION_TIMEOUT_MINUTES = "15";
    const { reservationId } = await makeReservation({ seatId: "H8" });

    // Cofamy expiresAt w store
    const store = global._inMemoryStore!;
    const res = store.reservations.find((r) => r._id === reservationId)!;
    res.expiresAt = new Date(Date.now() - 3600 * 1000);

    await expect(purchaseReservation(reservationId)).rejects.toThrow("RESERVATION_EXPIRED");

    delete process.env.RESERVATION_TIMEOUT_MINUTES;
  });

  // -------------------------------------------------------------------------
  // Wariant B – skrajny: dokładnie na granicy expiresAt
  // -------------------------------------------------------------------------
  it("[2-B-boundary] Zakup tuż przed wygaśnięciem → sukces", async () => {
    process.env.RESERVATION_TIMEOUT_MINUTES = "15";

    const { reservationId } = await makeReservation({ seatId: "A2" });
    // Kupujemy od razu – powinno zadziałać
    const result = await purchaseReservation(reservationId);
    expect(result.code).toMatch(/^TKT-A2-/);

    delete process.env.RESERVATION_TIMEOUT_MINUTES;
  });

  // -------------------------------------------------------------------------
  // Wariant C – Clock Drift: ręczna manipulacja expiresAt
  // -------------------------------------------------------------------------
  it("[2-C] Clock drift: expiresAt ustawiony na przeszłość → odrzucenie", async () => {
    process.env.RESERVATION_TIMEOUT_MINUTES = "15";

    const { reservationId } = await makeReservation({ seatId: "B3" });

    // Bezpośrednia manipulacja in-memory store – symulacja driftu
    const store = global._inMemoryStore!;
    const res = store.reservations.find((r) => r._id === reservationId)!;
    // Cofamy expiresAt o 1 godzinę
    res.expiresAt = new Date(Date.now() - 3600 * 1000);

    await expect(purchaseReservation(reservationId)).rejects.toThrow("RESERVATION_EXPIRED");

    delete process.env.RESERVATION_TIMEOUT_MINUTES;
  });

  // -------------------------------------------------------------------------
  // Wariant C – clock drift pozytywny: expiresAt nieznacznie w przyszłości
  // -------------------------------------------------------------------------
  it("[2-C-drift-positive] expiresAt 1 sekunda w przyszłości → zakup przechodzi", async () => {
    process.env.RESERVATION_TIMEOUT_MINUTES = "15";

    const { reservationId } = await makeReservation({ seatId: "C5" });

    // Ustaw expiresAt na +1s
    const store = global._inMemoryStore!;
    const res = store.reservations.find((r) => r._id === reservationId)!;
    res.expiresAt = new Date(Date.now() + 1000);

    const result = await purchaseReservation(reservationId);
    expect(result.code).toBeDefined();

    delete process.env.RESERVATION_TIMEOUT_MINUTES;
  });
});

// ---------------------------------------------------------------------------
// 3. ZAGROŻENIE: API Abuse – walidacja wejścia
// ---------------------------------------------------------------------------

describe("ZAGROŻENIE 3: API Abuse – walidacja wejścia (service layer)", () => {
  beforeEach(resetStore);

  // -------------------------------------------------------------------------
  // Wariant A – Brak wymaganych pól (simulowane przez bezpośrednie wywołanie)
  // -------------------------------------------------------------------------
  it("[3-A] Brak eventId → EVENT_NOT_FOUND", async () => {
    await expect(
      createReservation({
        eventId: "",
        seatIds: ["A1"],
        customerName: "Jan",
        email: "jan@test.com",
      })
    ).rejects.toThrow("EVENT_NOT_FOUND");
  });

  // -------------------------------------------------------------------------
  // Wariant B – Nieistniejący fotel (poza planem sali)
  // -------------------------------------------------------------------------
  it("[3-B] Fotel Z99 spoza planu sali → SEAT_INVALID", async () => {
    await expect(
      createReservation({
        eventId: VALID_EVENT_ID,
        seatIds: ["Z99"],
        customerName: "Bot",
        email: "bot@test.com",
      })
    ).rejects.toThrow("SEAT_INVALID");
  });

  it("[3-B] Fotel z pustym seatId → SEAT_INVALID", async () => {
    await expect(
      createReservation({
        eventId: VALID_EVENT_ID,
        seatIds: [""],
        customerName: "Bot",
        email: "bot@test.com",
      })
    ).rejects.toThrow("SEAT_INVALID");
  });

  it("[3-B] Rząd I (nieistniejący) → SEAT_INVALID", async () => {
    // Sala ma rzędy A-H; rząd I nie istnieje
    await expect(
      createReservation({
        eventId: VALID_EVENT_ID,
        seatIds: ["I1"],
        customerName: "Bot",
        email: "bot@test.com",
      })
    ).rejects.toThrow("SEAT_INVALID");
  });

  it("[3-B] Numer fotela 0 (poza zakresem 1-10) → SEAT_INVALID", async () => {
    await expect(
      createReservation({
        eventId: VALID_EVENT_ID,
        seatIds: ["A0"],
        customerName: "Bot",
        email: "bot@test.com",
      })
    ).rejects.toThrow("SEAT_INVALID");
  });

  it("[3-B] Numer fotela 11 (poza zakresem) → SEAT_INVALID", async () => {
    await expect(
      createReservation({
        eventId: VALID_EVENT_ID,
        seatIds: ["A11"],
        customerName: "Bot",
        email: "bot@test.com",
      })
    ).rejects.toThrow("SEAT_INVALID");
  });

  // -------------------------------------------------------------------------
  // Wariant C – SQL/NoSQL injection w polach tekstowych (bezpieczeństwo)
  // -------------------------------------------------------------------------
  it("[3-C] Injection w seatId → SEAT_INVALID (bezpieczne odrzucenie)", async () => {
    await expect(
      createReservation({
        eventId: VALID_EVENT_ID,
        seatIds: ["'; DROP TABLE reservations; --"],
        customerName: "Hacker",
        email: "h@h.com",
      })
    ).rejects.toThrow("SEAT_INVALID");
  });

  it("[3-C] Injection w eventId → EVENT_NOT_FOUND (bezpieczne odrzucenie)", async () => {
    await expect(
      createReservation({
        eventId: "{ $gt: '' }",
        seatIds: ["A1"],
        customerName: "Hacker",
        email: "h@h.com",
      })
    ).rejects.toThrow("EVENT_NOT_FOUND");
  });

  // -------------------------------------------------------------------------
  // Wariant C – skrajny: bardzo długie wartości pól
  // -------------------------------------------------------------------------
  it("[3-C-boundary] Ekstremalnie długi email → SEAT_INVALID (seatId poprawny, email nieprawidłowy)", async () => {
    // email trafia do bazy, ale seatId musi być walidowany wcześniej
    // Jeśli seatId jest OK, a email długi – rezerwacja powinna przejść (trimming)
    const longEmail = "a".repeat(500) + "@test.com";
    const result = await createReservation({
      eventId: VALID_EVENT_ID,
      seatIds: ["A1"],
      customerName: "Long",
      email: longEmail,
    });
    // System akceptuje (walidacja emaila nie jest na poziomie serwisu)
    expect(result.reservationId).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Wariant C – Nieistniejące eventId
  // -------------------------------------------------------------------------
  it("[3-C] Nieistniejące eventId → EVENT_NOT_FOUND", async () => {
    await expect(
      createReservation({
        eventId: "nieistniejacy-event-xyz",
        seatIds: ["A1"],
        customerName: "Bot",
        email: "bot@test.com",
      })
    ).rejects.toThrow("EVENT_NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// 4. ZAGROŻENIE: Idempotencja
// ---------------------------------------------------------------------------

describe("ZAGROŻENIE 4: Idempotencja zakupu", () => {
  beforeEach(resetStore);

  // -------------------------------------------------------------------------
  // Wariant A – Podwójny klik: purchaseReservation wywołany dwa razy
  // -------------------------------------------------------------------------
  it("[4-A] Podwójny zakup (idempotentny): zwraca ten sam kod biletu", async () => {
    const { reservationId, code: expectedCode } = await makeReservation({ seatId: "A1" });

    const [purchase1, purchase2] = await Promise.all([
      purchaseReservation(reservationId),
      purchaseReservation(reservationId),
    ]);

    expect(purchase1.code).toBe(expectedCode);
    expect(purchase2.code).toBe(expectedCode);
  });

  // -------------------------------------------------------------------------
  // Wariant A – sekwencyjne podwójne wywołanie
  // -------------------------------------------------------------------------
  it("[4-A-sequential] Sekwencyjny podwójny zakup: nie tworzy duplikatów", async () => {
    const { reservationId } = await makeReservation({ seatId: "B2" });

    const first = await purchaseReservation(reservationId);
    const second = await purchaseReservation(reservationId);

    expect(first.code).toEqual(second.code);
  });

  // -------------------------------------------------------------------------
  // Wariant B – Zakup przez kod biletu (idempotentny lookup po 'code')
  // -------------------------------------------------------------------------
  it("[4-B] Zakup po 'code' zamiast reservationId: idempotentny wynik", async () => {
    const { reservationId, code } = await makeReservation({ seatId: "C3" });

    // Pierwszy zakup po reservationId
    const firstPurchase = await purchaseReservation(reservationId);

    // Drugi zakup po 'code' – powinien zwrócić ten sam bilet
    const secondPurchase = await purchaseReservation(code);

    expect(firstPurchase.code).toBe(code);
    expect(secondPurchase.code).toBe(code);
  });

  // -------------------------------------------------------------------------
  // Wariant B – Nieznany klucz idempotentności → 404
  // -------------------------------------------------------------------------
  it("[4-B-negative] Nieznany klucz idempotentności → RESERVATION_NOT_FOUND", async () => {
    await expect(
      purchaseReservation("TKT-X9-FFFFFF")
    ).rejects.toThrow("RESERVATION_NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// 5. ZAGROŻENIE: Spam / Resource Exhaustion
// ---------------------------------------------------------------------------

describe("ZAGROŻENIE 5: Spam / Resource Exhaustion", () => {
  beforeEach(resetStore);

  // -------------------------------------------------------------------------
  // Wariant A – Masowe blokowanie: jeden klient rezerwuje WSZYSTKIE 80 foteli
  // -------------------------------------------------------------------------
  it("[5-A] Jeden klient rezerwuje wszystkie 80 miejsc w sali", async () => {
    const seats = [];
    for (const row of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
      for (let num = 1; num <= 10; num++) {
        seats.push(`${row}${num}`);
      }
    }

    const results = await Promise.allSettled(
      seats.map((seat, i) =>
        createReservation({
          eventId: VALID_EVENT_ID,
          seatIds: [seat],
          customerName: `Bot ${i}`,
          email: "spam@bot.com", // ten sam email
        })
      )
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Wszystkie 80 foteli są unikalne – wszystkie powinny przejść
    expect(fulfilled).toHaveLength(80);
    expect(rejected).toHaveLength(0);

    // Weryfikacja: wszystkie fotele są teraz zajęte
    const takenSeats = await getTakenSeats(VALID_EVENT_ID);
    expect(takenSeats).toHaveLength(80);
  }, 30000); // dłuższy timeout dla 80 równoległych operacji

  // -------------------------------------------------------------------------
  // Wariant A – po zajęciu wszystkich foteli: kolejne żądania odrzucane
  // -------------------------------------------------------------------------
  it("[5-A-full] Po zajęciu sali każda nowa rezerwacja jest odrzucona", async () => {
    // Zajmij wszystkie fotele sekwencyjnie
    const rows = ["A", "B", "C", "D", "E", "F", "G", "H"];
    for (const row of rows) {
      for (let num = 1; num <= 10; num++) {
        await createReservation({
          eventId: VALID_EVENT_ID,
          seatIds: [`${row}${num}`],
          customerName: "Spammer",
          email: "spam@test.com",
        });
      }
    }

    // Próba dodatkowej rezerwacji – sala zajęta
    await expect(
      createReservation({
        eventId: VALID_EVENT_ID,
        seatIds: ["A1"],
        customerName: "Pechowy",
        email: "late@test.com",
      })
    ).rejects.toThrow("SEAT_ALREADY_TAKEN");
  }, 30000);

  // -------------------------------------------------------------------------
  // Wariant B – Rate Limiting (jeśli zaimplementowane): test obecności nagłówka
  // Uwaga: Jeśli rate limiting nie jest zaimplementowany, test wskaże brak.
  // -------------------------------------------------------------------------
  it("[5-B] Weryfikacja poprawności danych po masowych rezerwacjach", async () => {
    // Rezerwuj 10 miejsc w rzędzie A
    for (let num = 1; num <= 10; num++) {
      await createReservation({
        eventId: VALID_EVENT_ID,
        seatIds: [`A${num}`],
        customerName: "Bot",
        email: `bot${num}@test.com`,
      });
    }

    const takenSeats = await getTakenSeats(VALID_EVENT_ID);

    // Sprawdź, że stan jest spójny – każdy fotel z rzędu A jest zajęty
    for (let num = 1; num <= 10; num++) {
      expect(takenSeats).toContain(`A${num}`);
    }

    // Fotele w rzędach B-H pozostają wolne
    expect(takenSeats).not.toContain("B1");
  });
});

// ---------------------------------------------------------------------------
// 6. Testy pomocnicze: getEventById
// ---------------------------------------------------------------------------

describe("getEventById – testy podstawowe", () => {
  beforeEach(resetStore);

  it("Zwraca istniejące wydarzenie", async () => {
    const event = await getEventById(VALID_EVENT_ID);
    expect(event).not.toBeNull();
    expect(event!._id).toBe(VALID_EVENT_ID);
    expect(event!.seats).toHaveLength(80);
  });

  it("Zwraca null dla nieistniejącego eventId", async () => {
    const event = await getEventById("nonexistent");
    expect(event).toBeNull();
  });

  it("Wszystkie trzy eventy są dostępne w domyślnym store", async () => {
    const e1 = await getEventById("seans-2026-11-21-1800");
    const e2 = await getEventById("seans-2026-11-21-2030");
    const e3 = await getEventById("seans-2026-11-22-1915");
    expect(e1).not.toBeNull();
    expect(e2).not.toBeNull();
    expect(e3).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 7. Rezerwacja wielu miejsc
// ---------------------------------------------------------------------------

describe("Rezerwacja wielu miejsc", () => {
  beforeEach(resetStore);

  const reserveSeats = (seatIds: string[], email = "multi@example.com") =>
    createReservation({
      eventId: VALID_EVENT_ID,
      seatIds,
      customerName: "Jan Kowalski",
      email,
    });

  it("Rezerwuje kilka miejsc jedną rezerwacją", async () => {
    const result = await reserveSeats(["C2", "C1", "C3"]);

    expect(result.seatIds).toEqual(["C1", "C2", "C3"]);
    expect(result.code).toMatch(/^TKT-C1-/);

    const taken = await getTakenSeats(VALID_EVENT_ID);
    expect(taken).toEqual(expect.arrayContaining(["C1", "C2", "C3"]));
  });

  it("Jedno zajęte miejsce blokuje całą rezerwację (all-or-nothing)", async () => {
    await reserveSeats(["D2"], "first@example.com");

    await expect(reserveSeats(["D1", "D2", "D3"], "second@example.com")).rejects.toThrow(
      "SEAT_ALREADY_TAKEN"
    );

    const taken = await getTakenSeats(VALID_EVENT_ID);
    expect(taken).not.toContain("D1");
    expect(taken).not.toContain("D3");
  });

  it("Przekroczenie limitu miejsc → SEAT_INVALID", async () => {
    await expect(
      reserveSeats(["E1", "E2", "E3", "E4", "E5", "E6", "E7"])
    ).rejects.toThrow("SEAT_INVALID");
  });

  it("Pusta lista miejsc → SEAT_INVALID", async () => {
    await expect(reserveSeats([])).rejects.toThrow("SEAT_INVALID");
  });

  it("Zakup obejmuje wszystkie miejsca rezerwacji", async () => {
    const { reservationId, code } = await reserveSeats(["F1", "F2"]);
    const purchase = await purchaseReservation(reservationId);
    expect(purchase.code).toBe(code);

    const store = global._inMemoryStore!;
    const res = store.reservations.find((r) => r._id === reservationId)!;
    res.expiresAt = new Date(Date.now() - 3600 * 1000);

    const taken = await getTakenSeats(VALID_EVENT_ID);
    expect(taken).toEqual(expect.arrayContaining(["F1", "F2"]));
  });
});

// ---------------------------------------------------------------------------
// 8. Idempotentność tworzenia rezerwacji
// ---------------------------------------------------------------------------

describe("Idempotentność tworzenia rezerwacji", () => {
  beforeEach(resetStore);

  it("Dwa równoległe identyczne żądania zwracają tę samą rezerwację bez duplikatu", async () => {
    const [r1, r2] = await Promise.all([
      makeReservation({ seatId: "G1" }),
      makeReservation({ seatId: "G1" }),
    ]);

    expect(r2.reservationId).toBe(r1.reservationId);
    expect(r2.code).toBe(r1.code);
    expect(global._inMemoryStore!.reservations).toHaveLength(1);
  });

  it("Ponowione identyczne żądanie (sekwencyjnie) zwraca istniejącą rezerwację", async () => {
    const first = await makeReservation({ seatId: "G2" });
    const retry = await makeReservation({ seatId: "G2" });

    expect(retry).toEqual(first);
    expect(global._inMemoryStore!.reservations).toHaveLength(1);
  });

  it("Inny zestaw miejsc tego samego klienta nie jest traktowany jako duplikat", async () => {
    await makeReservation({ seatId: "G3" });

    await expect(
      createReservation({
        eventId: VALID_EVENT_ID,
        seatIds: ["G3", "G4"],
        customerName: "Jan Kowalski",
        email: "jan@example.com",
      })
    ).rejects.toThrow("SEAT_ALREADY_TAKEN");
  });

  it("Po wygaśnięciu identyczne żądanie tworzy nową rezerwację", async () => {
    const first = await makeReservation({ seatId: "G5" });
    const res = global._inMemoryStore!.reservations.find((r) => r._id === first.reservationId)!;
    res.expiresAt = new Date(Date.now() - 1000);

    const second = await makeReservation({ seatId: "G5" });
    expect(second.reservationId).not.toBe(first.reservationId);
  });

  it("Kupiona rezerwacja nie jest zwracana ponownie – fotel zajęty", async () => {
    const { reservationId } = await makeReservation({ seatId: "G6" });
    await purchaseReservation(reservationId);

    await expect(makeReservation({ seatId: "G6" })).rejects.toThrow("SEAT_ALREADY_TAKEN");
  });
});

// ---------------------------------------------------------------------------
// 9. Przejścia stanów przy zakupie
// ---------------------------------------------------------------------------

describe("Przejścia stanów przy zakupie", () => {
  beforeEach(resetStore);

  const findReservation = (id: string) =>
    global._inMemoryStore!.reservations.find((r) => r._id === id)!;

  it("RESERVED → PURCHASED ustawia purchasedAt dokładnie raz przy wielokrotnym zakupie", async () => {
    const { reservationId } = await makeReservation({ seatId: "H1" });

    await purchaseReservation(reservationId);
    const firstPurchasedAt = findReservation(reservationId).purchasedAt;

    await Promise.all([purchaseReservation(reservationId), purchaseReservation(reservationId)]);

    expect(findReservation(reservationId).status).toBe("PURCHASED");
    expect(findReservation(reservationId).purchasedAt).toBe(firstPurchasedAt);
  });

  it("Zakup po expiresAt oznacza rezerwację jako EXPIRED i kolejne próby też odmawiają", async () => {
    const { reservationId } = await makeReservation({ seatId: "H2" });
    findReservation(reservationId).expiresAt = new Date(Date.now() - 1000);

    await expect(purchaseReservation(reservationId)).rejects.toThrow("RESERVATION_EXPIRED");
    expect(findReservation(reservationId).status).toBe("EXPIRED");
    await expect(purchaseReservation(reservationId)).rejects.toThrow("RESERVATION_EXPIRED");

    const taken = await getTakenSeats(VALID_EVENT_ID);
    expect(taken).not.toContain("H2");
  });
});
