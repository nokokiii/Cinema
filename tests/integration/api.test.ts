/**
 * ============================================================================
 * INTEGRATION TESTS – API routes przez Next.js standalone fetch
 * ============================================================================
 * Testy te uderzają w DZIAŁAJĄCY serwer Next.js (lub jego adres testowy).
 *
 * Uruchomienie:
 *   1. W jednym terminalu: RESERVATION_TIMEOUT_MINUTES=0 npm run dev
 *   2. W drugim:           npx jest tests/integration/api.test.ts --verbose
 *
 * Domyślnie testy uderzają w http://localhost:3000.
 * Można nadpisać: TEST_BASE_URL=http://localhost:3001 npx jest ...
 *
 * Wymagania:
 *   npm install --save-dev jest @types/jest ts-jest node-fetch@2
 * ============================================================================
 */

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

// Utility: wrapper na fetch z JSON body
async function api(
  method: string,
  path: string,
  body?: object,
  headers?: Record<string, string>
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let responseBody: Record<string, unknown>;
  try {
    responseBody = await res.json();
  } catch {
    responseBody = {};
  }

  return { status: res.status, body: responseBody };
}

// ---------------------------------------------------------------------------
// Stałe testowe
// ---------------------------------------------------------------------------
const VALID_EVENT_ID = "seans-2026-11-21-1800";

// Pomocnik: rezerwuje unikalny fotel na potrzeby testu
let seatCounter = 1;
function nextSeat(): string {
  const rows = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const rowIndex = Math.floor((seatCounter - 1) / 10);
  const colIndex = ((seatCounter - 1) % 10) + 1;
  seatCounter++;
  return `${rows[rowIndex]}${colIndex}`;
}

async function reserveSeat(seatId?: string) {
  return api("POST", "/api/reservations", {
    eventId: VALID_EVENT_ID,
    seatId: seatId ?? nextSeat(),
    customerName: "Tester API",
    email: "tester@cinema.test",
  });
}

// ============================================================================
// 1. ZAGROŻENIE: Double Booking
// ============================================================================

describe("API: ZAGROŻENIE 1 – Double Booking", () => {
  // -------------------------------------------------------------------------
  // Wariant A – Równoległe POST /api/reservations
  // -------------------------------------------------------------------------
  it("[1-A] Równoległe żądania: dokładnie 1×201, pozostałe 409", async () => {
    const seat = nextSeat();

    const [r1, r2, r3] = await Promise.all([
      reserveSeat(seat),
      reserveSeat(seat),
      reserveSeat(seat),
    ]);

    const responses = [r1, r2, r3];
    const successes = responses.filter((r) => r.status === 201);
    const conflicts = responses.filter((r) => r.status === 409);

    expect(successes.length).toBe(1);
    expect(conflicts.length).toBe(2);

    conflicts.forEach((r) => {
      expect(r.body).toHaveProperty("error");
    });
  });

  // -------------------------------------------------------------------------
  // Wariant A – boundary: race między dwoma żądaniami (min. 2)
  // -------------------------------------------------------------------------
  it("[1-A-boundary] Dwa równoległe żądania: wynik 1+1, nie 2+0", async () => {
    const seat = nextSeat();
    const [r1, r2] = await Promise.all([reserveSeat(seat), reserveSeat(seat)]);

    const statuses = [r1.status, r2.status].sort();
    // Jeden 201, jeden 409
    expect(statuses).toEqual([201, 409]);
  });

  // -------------------------------------------------------------------------
  // Wariant B – Fotel już zarezerwowany (pending)
  // -------------------------------------------------------------------------
  it("[1-B] Fotel RESERVED blokuje następne żądanie (409)", async () => {
    const seat = nextSeat();

    // Użytkownik A rezerwuje
    const first = await reserveSeat(seat);
    expect(first.status).toBe(201);

    // Użytkownik B – ten sam fotel
    const second = await reserveSeat(seat);
    expect(second.status).toBe(409);
    expect(second.body).toHaveProperty("error");
    expect(String(second.body.error)).toMatch(/reserved|taken/i);
  });

  // -------------------------------------------------------------------------
  // Wariant C – Konflikt przy zakupie: dwa równoległe purchase
  // -------------------------------------------------------------------------
  it("[1-C] Dwa równoległe zakupy tej samej rezerwacji: idempotentny kod", async () => {
    const seat = nextSeat();
    const res = await reserveSeat(seat);
    expect(res.status).toBe(201);

    const reservationId = res.body.reservationId as string;

    const [p1, p2] = await Promise.all([
      api("POST", `/api/reservations/${reservationId}/purchase`),
      api("POST", `/api/reservations/${reservationId}/purchase`),
    ]);

    // Oba powinny zakończyć się sukcesem z TYM SAMYM kodem biletu
    expect(p1.status).toBe(200);
    expect(p2.status).toBe(200);
    expect(p1.body.code).toEqual(p2.body.code);
  });
});

// ============================================================================
// 2. ZAGROŻENIE: Wiszące rezerwacje-zombi
// ============================================================================

describe("API: ZAGROŻENIE 2 – Wiszące rezerwacje-zombi", () => {
  /**
   * UWAGA: Warianty 2-A i 2-B wymagają uruchomienia serwera z:
   *   RESERVATION_TIMEOUT_MINUTES=0 npm run dev
   * Wtedy rezerwacje wygasają natychmiastowo.
   */

  // -------------------------------------------------------------------------
  // Wariant A – Wygasły fotel znika z takenSeats (wymaga timeout=0)
  // -------------------------------------------------------------------------
  it("[2-A] Wygasły fotel NIE jest w takenSeats [wymaga RESERVATION_TIMEOUT_MINUTES=0]", async () => {
    const seat = nextSeat();
    const res = await reserveSeat(seat);
    expect(res.status).toBe(201);

    // Czekamy chwilę (przy timeout=0, expiresAt jest już przeszłością)
    await new Promise((r) => setTimeout(r, 200));

    const eventRes = await api("GET", `/api/events/${VALID_EVENT_ID}`);
    expect(eventRes.status).toBe(200);

    const takenSeats = eventRes.body.takenSeats as string[];
    expect(takenSeats).not.toContain(seat);
  });

  // -------------------------------------------------------------------------
  // Wariant B – Zakup wygasłej rezerwacji (wymaga timeout=0)
  // -------------------------------------------------------------------------
  it("[2-B] Zakup wygasłej rezerwacji → 410 Gone [wymaga RESERVATION_TIMEOUT_MINUTES=0]", async () => {
    const seat = nextSeat();
    const res = await reserveSeat(seat);
    expect(res.status).toBe(201);

    const reservationId = res.body.reservationId as string;

    await new Promise((r) => setTimeout(r, 200));

    const purchase = await api("POST", `/api/reservations/${reservationId}/purchase`);
    expect(purchase.status).toBe(410); // Gone – wygasła
    expect(String(purchase.body.error)).toMatch(/expired/i);
  });

  // -------------------------------------------------------------------------
  // Wariant C – Graniczny: zakup tuż po wygaśnięciu
  // -------------------------------------------------------------------------
  it("[2-C] Zakup aktywnej rezerwacji (timeout=15min) → 200 OK", async () => {
    const seat = nextSeat();
    const res = await reserveSeat(seat);
    expect(res.status).toBe(201);

    const reservationId = res.body.reservationId as string;

    // Kupujemy od razu (nie czekamy) – powinno działać przy normalnym timeout
    const purchase = await api("POST", `/api/reservations/${reservationId}/purchase`);
    expect(purchase.status).toBe(200);
    expect(purchase.body.code).toMatch(/^TKT-/);
  });
});

// ============================================================================
// 3. ZAGROŻENIE: API Abuse – walidacja wejścia
// ============================================================================

describe("API: ZAGROŻENIE 3 – API Abuse & walidacja wejścia", () => {
  // -------------------------------------------------------------------------
  // Wariant A – Brak wymaganych pól
  // -------------------------------------------------------------------------
  it("[3-A] Brak wszystkich pól → 400 Bad Request", async () => {
    const res = await api("POST", "/api/reservations", {});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("[3-A] Brak email → 400", async () => {
    const res = await api("POST", "/api/reservations", {
      eventId: VALID_EVENT_ID,
      seatId: "A1",
      customerName: "Jan",
    });
    expect(res.status).toBe(400);
  });

  it("[3-A] Brak seatId → 400", async () => {
    const res = await api("POST", "/api/reservations", {
      eventId: VALID_EVENT_ID,
      customerName: "Jan",
      email: "jan@test.com",
    });
    expect(res.status).toBe(400);
  });

  it("[3-A] Brak customerName → 400", async () => {
    const res = await api("POST", "/api/reservations", {
      eventId: VALID_EVENT_ID,
      seatId: "A1",
      email: "jan@test.com",
    });
    expect(res.status).toBe(400);
  });

  it("[3-A] Brak eventId → 400 lub 404", async () => {
    const res = await api("POST", "/api/reservations", {
      seatId: "A1",
      customerName: "Jan",
      email: "jan@test.com",
    });
    expect([400, 404]).toContain(res.status);
  });

  // -------------------------------------------------------------------------
  // Wariant B – Broken Object Level Authorization (nieistniejące zasoby)
  // -------------------------------------------------------------------------
  it("[3-B] Fotel Z99 (spoza sali) → 400", async () => {
    const res = await api("POST", "/api/reservations", {
      eventId: VALID_EVENT_ID,
      seatId: "Z99",
      customerName: "Hacker",
      email: "h@h.com",
    });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/invalid seat/i);
  });

  it("[3-B] Nieistniejący eventId → 404", async () => {
    const res = await api("POST", "/api/reservations", {
      eventId: "nonexistent-event-abc123",
      seatId: "A1",
      customerName: "Hacker",
      email: "h@h.com",
    });
    expect(res.status).toBe(404);
  });

  it("[3-B] Zakup nieistniejącej rezerwacji → 404", async () => {
    const res = await api("POST", "/api/reservations/nonexistent-id-xyz/purchase");
    expect(res.status).toBe(404);
  });

  it("[3-B] GET nieistniejącego eventu → 404", async () => {
    const res = await api("GET", "/api/events/nieistniejacy-seans");
    expect(res.status).toBe(404);
  });

  it("[3-B] GET nieistniejącej rezerwacji → 404", async () => {
    const res = await api("GET", "/api/reservations/nieistniejaca-rezerwacja-xyz");
    expect(res.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // Wariant C – Niepoprawne formaty danych
  // -------------------------------------------------------------------------
  it("[3-C] Liczba jako seatId (typ number zamiast string) → obsłużone", async () => {
    const res = await api("POST", "/api/reservations", {
      eventId: VALID_EVENT_ID,
      seatId: 123, // liczba zamiast stringa
      customerName: "Test",
      email: "t@t.com",
    });
    // System konwertuje do stringa "123" → SEAT_INVALID
    expect([400, 409]).toContain(res.status);
  });

  it("[3-C] Null jako email → 400", async () => {
    const res = await api("POST", "/api/reservations", {
      eventId: VALID_EVENT_ID,
      seatId: "A1",
      customerName: "Test",
      email: null,
    });
    expect(res.status).toBe(400);
  });

  it("[3-C] Array jako seatId → 400", async () => {
    const res = await api("POST", "/api/reservations", {
      eventId: VALID_EVENT_ID,
      seatId: ["A1", "A2"],
      customerName: "Test",
      email: "t@t.com",
    });
    // Konwersja przez String(["A1","A2"]) → "A1,A2" → SEAT_INVALID → 400
    expect(res.status).toBe(400);
  });

  it("[3-C] NoSQL injection w eventId → bezpieczna odpowiedź (nie 500)", async () => {
    const res = await api("POST", "/api/reservations", {
      eventId: { $gt: "" },
      seatId: "A1",
      customerName: "Hacker",
      email: "h@h.com",
    });
    // Musi być 400 lub 404, nigdy 500
    expect(res.status).not.toBe(500);
    expect([400, 404]).toContain(res.status);
  });

  it("[3-C] XSS w customerName → zaakceptowany (sanityzacja downstream)", async () => {
    const seat = nextSeat();
    const res = await api("POST", "/api/reservations", {
      eventId: VALID_EVENT_ID,
      seatId: seat,
      customerName: '<script>alert("xss")</script>',
      email: "xss@test.com",
    });
    // API przyjmuje (sanityzacja po stronie klienta / szablonów), ale nie crashuje
    expect(res.status).not.toBe(500);
  });
});

// ============================================================================
// 4. ZAGROŻENIE: Idempotencja – Retry Storm
// ============================================================================

describe("API: ZAGROŻENIE 4 – Idempotencja & Retry Storm", () => {
  // -------------------------------------------------------------------------
  // Wariant A – Podwójny klik (równoległe purchase)
  // -------------------------------------------------------------------------
  it("[4-A] Podwójny click zakupu: brak duplikatu biletu, brak 500", async () => {
    const seat = nextSeat();
    const res = await reserveSeat(seat);
    expect(res.status).toBe(201);

    const id = res.body.reservationId as string;

    const [p1, p2] = await Promise.all([
      api("POST", `/api/reservations/${id}/purchase`),
      api("POST", `/api/reservations/${id}/purchase`),
    ]);

    // Żadna odpowiedź nie może być 500
    expect(p1.status).not.toBe(500);
    expect(p2.status).not.toBe(500);

    // Oba muszą zawierać 'code'
    expect(p1.body).toHaveProperty("code");
    expect(p2.body).toHaveProperty("code");

    // Muszą zwrócić IDENTYCZNY kod biletu
    expect(p1.body.code).toEqual(p2.body.code);
  });

  // -------------------------------------------------------------------------
  // Wariant A – sekwencyjny retry (symulacja timeoutu sieci)
  // -------------------------------------------------------------------------
  it("[4-A-retry] Sekwencyjny retry po 100ms: ten sam bilet", async () => {
    const seat = nextSeat();
    const res = await reserveSeat(seat);
    const id = res.body.reservationId as string;

    const p1 = await api("POST", `/api/reservations/${id}/purchase`);
    await new Promise((r) => setTimeout(r, 100)); // symulacja retry po "timeoucie"
    const p2 = await api("POST", `/api/reservations/${id}/purchase`);

    expect(p1.status).toBe(200);
    expect(p2.status).toBe(200);
    expect(p1.body.code).toEqual(p2.body.code);
  });

  // -------------------------------------------------------------------------
  // Wariant B – Idempotency Key: zakup po code biletu zamiast ID
  // -------------------------------------------------------------------------
  it("[4-B] Zakup po reservationId a następnie po code: ten sam wynik", async () => {
    const seat = nextSeat();
    const res = await reserveSeat(seat);
    const id = res.body.reservationId as string;

    // Pierwsze zakup po ID
    const purchase1 = await api("POST", `/api/reservations/${id}/purchase`);
    expect(purchase1.status).toBe(200);

    const ticketCode = purchase1.body.code as string;

    // Drugie zakup po kodzie biletu (jak header Idempotency-Key)
    const purchase2 = await api("POST", `/api/reservations/${ticketCode}/purchase`);
    expect(purchase2.status).toBe(200);
    expect(purchase2.body.code).toEqual(ticketCode);
  });

  // -------------------------------------------------------------------------
  // Wariant B – skrajny: nieznany Idempotency-Key
  // -------------------------------------------------------------------------
  it("[4-B-negative] Nieznany klucz idempotentności → 404 (nie 500)", async () => {
    const res = await api("POST", "/api/reservations/FAKE-KEY-DOES-NOT-EXIST/purchase");
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(500);
  });
});

// ============================================================================
// 5. ZAGROŻENIE: Spam / Resource Exhaustion
// ============================================================================

describe("API: ZAGROŻENIE 5 – Spam & Resource Exhaustion", () => {
  // -------------------------------------------------------------------------
  // Wariant A – Bot masowo rezerwuje miejsca (10 równoległych żądań)
  // -------------------------------------------------------------------------
  it("[5-A] 10 równoległych rezerwacji różnych foteli: wszystkie przechodzą", async () => {
    const seats = Array.from({ length: 10 }, () => nextSeat());

    const results = await Promise.all(seats.map((s) => reserveSeat(s)));

    const successes = results.filter((r) => r.status === 201);
    expect(successes.length).toBe(10);
  }, 15000);

  // -------------------------------------------------------------------------
  // Wariant A – 5 równoległych żądań na TEN SAM fotel
  // -------------------------------------------------------------------------
  it("[5-A-spam] 5 żądań na ten sam fotel: dokładnie 1 sukces", async () => {
    const seat = nextSeat();

    const results = await Promise.all(
      Array.from({ length: 5 }, () => reserveSeat(seat))
    );

    const successes = results.filter((r) => r.status === 201);
    const blocked = results.filter((r) => r.status === 409);

    expect(successes.length).toBe(1);
    expect(blocked.length).toBe(4);
  });

  // -------------------------------------------------------------------------
  // Wariant B – Rate Limiting: check nagłówka Retry-After lub X-RateLimit
  // -------------------------------------------------------------------------
  it("[5-B] 20 szybkich żądań: serwer nie zwraca 500 (odporność na spam)", async () => {
    const seats = Array.from({ length: 20 }, () => nextSeat());

    const results = await Promise.all(
      seats.map((s) =>
        api("POST", "/api/reservations", {
          eventId: VALID_EVENT_ID,
          seatId: s,
          customerName: "SpamBot",
          email: "spam@bot.com",
        })
      )
    );

    // Żadna odpowiedź nie może być błędem serwera (500)
    results.forEach((r) => {
      expect(r.status).not.toBe(500);
      expect([200, 201, 400, 409, 429]).toContain(r.status);
    });

    // Jeśli rate limiting zwróci 429, sprawdź nagłówek
    const rateLimited = results.filter((r) => r.status === 429);
    if (rateLimited.length > 0) {
      console.log(`[5-B] Rate limiting aktywny: ${rateLimited.length}/20 żądań zablokowanych`);
    }
  }, 20000);

  // -------------------------------------------------------------------------
  // Wariant B – Walidacja odpowiedzi GET /api/events po ataku
  // -------------------------------------------------------------------------
  it("[5-B-post-attack] Po masowej rezerwacji GET /api/events/:id zwraca spójne dane", async () => {
    // Zarezerwuj 5 miejsc
    const batchSeats = Array.from({ length: 5 }, () => nextSeat());
    await Promise.all(batchSeats.map((s) => reserveSeat(s)));

    // Sprawdź stan eventu
    const eventRes = await api("GET", `/api/events/${VALID_EVENT_ID}`);
    expect(eventRes.status).toBe(200);
    expect(eventRes.body).toHaveProperty("takenSeats");
    expect(Array.isArray(eventRes.body.takenSeats)).toBe(true);

    // takenSeats musi zawierać wszystkie zarezerwowane miejsca
    const takenSeats = eventRes.body.takenSeats as string[];
    batchSeats.forEach((s) => {
      expect(takenSeats).toContain(s);
    });
  });
});

// ============================================================================
// Testy bazowe: GET endpoints
// ============================================================================

describe("API: GET endpoints – testy podstawowe", () => {
  it("GET /api/events → 200, tablica eventów", async () => {
    const res = await api("GET", "/api/events");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/events/:id → 200 z takenSeats", async () => {
    const res = await api("GET", `/api/events/${VALID_EVENT_ID}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("event");
    expect(res.body).toHaveProperty("takenSeats");
  });

  it("GET /api/reservations/:id → 200 po rezerwacji", async () => {
    const seat = nextSeat();
    const reserveRes = await reserveSeat(seat);
    const id = reserveRes.body.reservationId as string;

    const res = await api("GET", `/api/reservations/${id}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("reservation");
    expect(res.body).toHaveProperty("event");
  });
});
