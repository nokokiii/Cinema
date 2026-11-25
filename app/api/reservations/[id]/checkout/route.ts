// POST /api/reservations/:id/checkout - Creates (or reuses) a Stripe Checkout Session
// Etap III: accepts an optional { points } body to pay part of the price with loyalty points.
import { NextResponse } from "next/server";
import {
  getReservationDetails,
  setReservationStripeSession,
  commitReservationPoints,
} from "@/app/lib/events-service";
import { getStripeConfig, stripe } from "@/app/lib/stripe";
import { getLoyaltyProvider, maxRedeemablePoints } from "@/app/lib/loyalty";
import { enforceRateLimit } from "@/app/lib/rate-limit";
import { isValidReservationIdOrCode } from "@/app/lib/validation";
import { apiError } from "@/app/lib/api-errors";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = enforceRateLimit(request, "purchase");
  if (limited) return limited;

  const { id } = await params;
  if (!isValidReservationIdOrCode(id)) {
    return apiError(400, "Invalid reservation id format");
  }

  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe is not configured on the server" },
      { status: 503 },
    );
  }

  const { currency } = getStripeConfig();

  try {
    const details = await getReservationDetails(id);
    if (!details) {
      return apiError(404, "Reservation not found");
    }

    if (!details.event) {
      return apiError(404, "Event not found");
    }

    if (details.reservation.status === "PURCHASED") {
      return NextResponse.json(
        { error: "Reservation already purchased", code: details.reservation.code },
        { status: 409 },
      );
    }

    if (details.isExpired) {
      return apiError(410, "Reservation expired, seat returned to pool");
    }

    const { reservation, event } = details;

    // Fast-path reuse so an obvious retry skips an extra Stripe round-trip; the real
    // guarantee against two live payable sessions is the idempotency key below, which
    // Stripe enforces itself even under genuine concurrent requests.
    if (reservation.stripeSessionId) {
      const existingSession = await stripe.checkout.sessions
        .retrieve(reservation.stripeSessionId)
        .catch(() => null);
      if (existingSession && existingSession.status === "open" && existingSession.url) {
        return NextResponse.json({ url: existingSession.url });
      }
    }

    // Points are only ever processed once per reservation, on whichever call first commits
    // them; a retry (e.g. after a cancelled Stripe session) reuses the committed amount.
    if (reservation.pointsUsed === undefined) {
      const body = await request.json().catch(() => ({}));
      const requestedPoints = (body as { points?: unknown })?.points;

      if (requestedPoints !== undefined) {
        if (!Number.isInteger(requestedPoints) || (requestedPoints as number) < 0) {
          return apiError(400, "points must be a non-negative integer");
        }
        const points = requestedPoints as number;

        if (points > 0) {
          const maxPoints = maxRedeemablePoints(reservation.amount);
          if (points > maxPoints) {
            return apiError(400, `points cannot exceed half the ticket price (max ${maxPoints})`);
          }

          const balance = await getLoyaltyProvider().getBalance(reservation.email);
          if (points > balance) {
            return apiError(400, "Not enough loyalty points");
          }

          await commitReservationPoints(reservation, points);
        }
      }
    }

    const amountDue = reservation.amount - (reservation.pointsUsed ?? 0);
    const origin = new URL(request.url).origin;
    const encodedReservationId = encodeURIComponent(reservation._id);
    const encodedEventId = encodeURIComponent(reservation.eventId);
    const encodedSeats = encodeURIComponent(reservation.seatIds.join(","));

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        allowed_payment_method_types: ["card"],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency,
              unit_amount: amountDue,
              product_data: {
                name: `${event.title} (${reservation.seatIds.join(", ")})`,
                description: `${event.hall} • ${new Date(event.startsAt).toLocaleString("pl-PL")}`,
              },
            },
          },
        ],
        metadata: {
          reservationId: reservation._id,
          reservationCode: reservation.code,
          eventId: reservation.eventId,
          seatIds: reservation.seatIds.join(","),
        },
        success_url: `${origin}/reservations/${encodedReservationId}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/reserve?eventId=${encodedEventId}&seats=${encodedSeats}&reservationId=${encodedReservationId}&checkout=cancelled`,
      },
      {
        // Two concurrent/double-clicked requests for the same reservation (and, after the
        // atomic points commit above, the same amountDue) collapse into the one session
        // Stripe actually creates — this is what stops the seat from being paid for twice,
        // not the reuse check above, which is only a fast path.
        idempotencyKey: `checkout:${reservation._id}`,
      }
    );

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe checkout URL is missing" },
        { status: 500 },
      );
    }

    await setReservationStripeSession(reservation._id, session.id);

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Failed to create Stripe checkout session:", error);
    return NextResponse.json(
      { error: "Failed to create Stripe checkout session" },
      { status: 500 },
    );
  }
}
