// Etap III Card C: purchase confirmation email via Resend.
// No verified domain, so sends go from onboarding@resend.dev and only actually deliver to
// the account owner's address or a published *.resend.dev test address — everything else
// is accepted by the API but silently undelivered. That's expected in test mode, so a send
// failure here must never fail the purchase itself (see callers: always wrapped, never thrown).
import { ReservationDocument, EventDocument } from "./types";

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "Kino Gwiazda <onboarding@resend.dev>";

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function formatPln(amountMinor: number): string {
  return `${(amountMinor / 100).toFixed(2)} zł`;
}

export interface PurchaseConfirmationInput {
  reservation: ReservationDocument;
  event: EventDocument | null;
}

function buildConfirmationEmail({ reservation, event }: PurchaseConfirmationInput) {
  const paidByCard = reservation.amount - (reservation.pointsUsed ?? 0);
  const seatLabel = reservation.seatIds.join(", ");
  const subject = `Twój bilet: ${event?.title ?? "Kino Gwiazda"} (${reservation.code})`;

  const lines = [
    `Film: ${event?.title ?? "—"}`,
    `Sala: ${event?.hall ?? "—"}`,
    `Miejsce: ${seatLabel}`,
    `Kod biletu: ${reservation.code}`,
    "",
    "Podsumowanie płatności:",
    `- Zapłacono kartą: ${formatPln(paidByCard)}`,
    ...(reservation.pointsUsed ? [`- Zapłacono punktami: ${reservation.pointsUsed} pkt`] : []),
    ...(reservation.pointsEarned ? [`- Zebrane punkty: ${reservation.pointsEarned} pkt`] : []),
  ];

  const text = lines.join("\n");
  const html = `<pre style="font:14px/1.5 monospace">${lines.map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;")).join("\n")}</pre>`;

  return { subject, text, html };
}

/**
 * Sends the purchase confirmation email. Never throws — a Resend failure (including the
 * expected "can't send to this address in test mode" case) is logged and swallowed so it
 * can never block ticket issuance.
 */
export async function sendPurchaseConfirmationEmail(input: PurchaseConfirmationInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set, skipping purchase confirmation email");
    return;
  }

  const { subject, text, html } = buildConfirmationEmail(input);

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [input.reservation.email],
        subject,
        text,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[email] Resend rejected the confirmation email (${res.status}): ${body}`);
      return;
    }
  } catch (error) {
    console.warn("[email] Failed to reach Resend:", error);
  }
}
