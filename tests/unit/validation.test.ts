import { describe, expect, it } from "@jest/globals";
import {
  isValidEventId,
  isValidReservationIdOrCode,
  validateCreateReservationPayload,
} from "@/app/lib/validation";

const withoutSeat = {
  eventId: "seans-2026-11-21-1800",
  customerName: "Jan Kowalski",
  email: "Jan@Example.com ",
};

const validPayload = { ...withoutSeat, seatId: "A1" };

function expectError(body: unknown, pattern: RegExp) {
  const result = validateCreateReservationPayload(body);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toMatch(pattern);
}

describe("isValidEventId", () => {
  it.each(["seans-2026-11-21-1800", "nonexistent-event-abc123"])("akceptuje %s", (id) => {
    expect(isValidEventId(id)).toBe(true);
  });

  it.each([
    "",
    "{ $gt: '' }",
    "$where",
    "Seans-Z-Duzej",
    "a".repeat(65),
    "trailing-",
    123,
    { $gt: "" },
  ])("odrzuca %p", (id) => {
    expect(isValidEventId(id)).toBe(false);
  });
});

describe("isValidReservationIdOrCode", () => {
  it.each(["3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b", "TKT-A1-1F2E3D", "TKT-H10-ABCDEF"])(
    "akceptuje %s",
    (id) => {
      expect(isValidReservationIdOrCode(id)).toBe(true);
    }
  );

  it.each(["nonexistent-id-xyz", "TKT-A1-XYZ123", "tkt-a1-1f2e3d", "", "3f2b8c1e"])(
    "odrzuca %p",
    (id) => {
      expect(isValidReservationIdOrCode(id)).toBe(false);
    }
  );
});

describe("validateCreateReservationPayload", () => {
  it("Normalizuje poprawny payload z seatId", () => {
    expect(validateCreateReservationPayload(validPayload)).toEqual({
      ok: true,
      value: {
        eventId: "seans-2026-11-21-1800",
        seatIds: ["A1"],
        customerName: "Jan Kowalski",
        email: "jan@example.com",
      },
    });
  });

  it("Akceptuje seatIds jako tablicę", () => {
    const result = validateCreateReservationPayload({ ...withoutSeat, seatIds: ["A1", "A2"] });
    expect(result.ok && result.value.seatIds).toEqual(["A1", "A2"]);
  });

  it.each([null, [], "text", 42])("Body %p nie będące obiektem → błąd", (body) => {
    expectError(body, /JSON object/);
  });

  it("Nieznane pola → błąd", () => {
    expectError({ ...validPayload, isAdmin: true }, /Unknown fields: isAdmin/);
  });

  it("Brak wymaganych pól → błąd", () => {
    expectError({ eventId: validPayload.eventId }, /Missing required fields/);
  });

  it("Obiekt jako eventId (NoSQL injection) → błąd", () => {
    expectError({ ...validPayload, eventId: { $gt: "" } }, /eventId/);
  });

  it("seatId i seatIds jednocześnie → błąd", () => {
    expectError({ ...validPayload, seatIds: ["A2"] }, /either seatId or seatIds/);
  });

  it.each([123, ["A1", "A2"], "a1", "A0", "AA1", "A100"])("Niepoprawne seatId %p → błąd", (seatId) => {
    expectError({ ...validPayload, seatId }, /seat/i);
  });

  it("Za dużo miejsc → błąd", () => {
    expectError(
      { ...withoutSeat, seatIds: ["A1", "A2", "A3", "A4", "A5", "A6", "A7"] },
      /between 1 and 6 seats/
    );
  });

  it("Pusta tablica seatIds → błąd", () => {
    expectError({ ...withoutSeat, seatIds: [] }, /between 1 and 6 seats/);
  });

  it("Zduplikowane miejsca → błąd", () => {
    expectError({ ...withoutSeat, seatIds: ["A1", "A1"] }, /Duplicate/);
  });

  it.each([null, 42, " ", "J", "x".repeat(101)])("Niepoprawne customerName %p → błąd", (customerName) => {
    expectError({ ...validPayload, customerName }, /customerName/);
  });

  it.each([null, "not-an-email", "a@b", `${"a".repeat(250)}@test.com`])(
    "Niepoprawny email %p → błąd",
    (email) => {
      expectError({ ...validPayload, email }, /email/i);
    }
  );
});
