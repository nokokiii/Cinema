import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? "";
const stripePublishableKey =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const stripeCurrency = (process.env.STRIPE_CURRENCY ?? "pln").toLowerCase();
const stripeTicketPriceMinor = Number.parseInt(
  process.env.STRIPE_TICKET_PRICE_MINOR ?? "3000",
  10
);

export const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

export function getStripeConfig() {
  return {
    enabled: Boolean(stripeSecretKey),
    publishableKey: stripePublishableKey,
    webhookSecret: stripeWebhookSecret,
    currency: stripeCurrency,
    ticketPriceMinor:
      Number.isFinite(stripeTicketPriceMinor) && stripeTicketPriceMinor > 0
        ? stripeTicketPriceMinor
        : 3000,
  };
}
