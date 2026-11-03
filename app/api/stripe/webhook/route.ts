import { NextResponse } from "next/server";
import Stripe from "stripe";
import { purchaseReservation } from "@/app/lib/events-service";
import { getStripeConfig, stripe } from "@/app/lib/stripe";

function isNonRetriableReservationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message === "RESERVATION_NOT_FOUND" ||
    error.message === "RESERVATION_EXPIRED"
  );
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing Stripe signature" },
      { status: 400 },
    );
  }

  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe is not configured on the server" },
      { status: 503 },
    );
  }

  const { webhookSecret } = getStripeConfig();
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Stripe webhook secret is not configured" },
      { status: 503 },
    );
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("Invalid Stripe webhook signature:", error);
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 400 },
    );
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const reservationId = session.metadata?.reservationId;

      if (!reservationId) {
        console.error(
          "Stripe checkout.session.completed missing reservationId metadata",
        );
      } else {
        try {
          await purchaseReservation(reservationId);
        } catch (error) {
          if (isNonRetriableReservationError(error)) {
            console.warn(
              `Ignoring webhook checkout completion for reservation ${reservationId}:`,
              error,
            );
          } else {
            throw error;
          }
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Failed to process Stripe webhook:", error);
    return NextResponse.json(
      { error: "Failed to process Stripe webhook" },
      { status: 500 },
    );
  }
}
