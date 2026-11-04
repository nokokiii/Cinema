import { NextResponse } from "next/server";
import { getReservationDetails } from "@/app/lib/events-service";
import { getStripeConfig, stripe } from "@/app/lib/stripe";
import { enforceRateLimit } from "@/app/lib/rate-limit";
import { isValidReservationIdOrCode } from "@/app/lib/validation";
import { apiError } from "@/app/lib/api-errors";

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "purchase");
  if (limited) return limited;

  try {
    if (!stripe) {
      return NextResponse.json(
        { error: "Stripe is not configured on the server" },
        { status: 503 },
      );
    }

    const body = await request.json().catch(() => null);
    const reservationId =
      typeof body?.reservationId === "string" ? body.reservationId : "";

    if (!reservationId) {
      return apiError(400, "Missing reservationId");
    }

    if (!isValidReservationIdOrCode(reservationId)) {
      return apiError(400, "Invalid reservation id format");
    }

    const details = await getReservationDetails(reservationId);
    if (!details) {
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 },
      );
    }

    if (!details.event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (details.reservation.status === "PURCHASED") {
      return NextResponse.json(
        {
          error: "Reservation already purchased",
          code: details.reservation.code,
        },
        { status: 409 },
      );
    }

    if (details.isExpired) {
      return NextResponse.json(
        { error: "Reservation expired, seat returned to pool" },
        { status: 410 },
      );
    }

    const { currency, ticketPriceMinor } = getStripeConfig();
    const origin = new URL(request.url).origin;
    const encodedReservationId = encodeURIComponent(details.reservation._id);
    const encodedEventId = encodeURIComponent(details.reservation.eventId);
    const { seatIds } = details.reservation;
    const encodedSeats = encodeURIComponent(seatIds.join(","));

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      allowed_payment_method_types: ["card"],
      line_items: [
        {
          quantity: seatIds.length,
          price_data: {
            currency,
            unit_amount: ticketPriceMinor,
            product_data: {
              name: `${details.event.title} (${seatIds.join(", ")})`,
              description: `${details.event.hall} • ${new Date(
                details.event.startsAt,
              ).toLocaleString("pl-PL")}`,
            },
          },
        },
      ],
      metadata: {
        reservationId: details.reservation._id,
        reservationCode: details.reservation.code,
        eventId: details.reservation.eventId,
        seatIds: seatIds.join(","),
      },
      success_url: `${origin}/reservations/${encodedReservationId}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/reserve?eventId=${encodedEventId}&seats=${encodedSeats}&checkout=cancelled`,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe checkout URL is missing" },
        { status: 500 },
      );
    }

    return NextResponse.json({ checkoutUrl: session.url });
  } catch (error) {
    console.error("Failed to create Stripe checkout session:", error);
    return NextResponse.json(
      { error: "Failed to create Stripe checkout session" },
      { status: 500 },
    );
  }
}
