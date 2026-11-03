import { NextResponse } from "next/server";
import { getReservationDetails } from "@/app/lib/events-service";
import { getStripeConfig, stripe } from "@/app/lib/stripe";

export async function POST(request: Request) {
  try {
    if (!stripe) {
      return NextResponse.json(
        { error: "Stripe is not configured on the server" },
        { status: 503 },
      );
    }

    const body = await request.json();
    const reservationId =
      typeof body?.reservationId === "string" ? body.reservationId : "";

    if (!reservationId) {
      return NextResponse.json(
        { error: "Missing reservationId" },
        { status: 400 },
      );
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
    const encodedSeatId = encodeURIComponent(details.reservation.seatId);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      allowed_payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: ticketPriceMinor,
            product_data: {
              name: `${details.event.title} (${details.reservation.seatId})`,
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
        seatId: details.reservation.seatId,
      },
      success_url: `${origin}/reservations/${encodedReservationId}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/reserve?eventId=${encodedEventId}&seatId=${encodedSeatId}&checkout=cancelled`,
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
