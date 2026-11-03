# Cinema

Minimal setup guide for local development and Stripe sandbox payments.

## 1) Install and run

```bash
npm install
cp .env.sample .env.local
npm run dev
```

Open: http://localhost:3000

## 2) Required environment variables

Set these in `.env.local`:

```env
MONGODB_URI="mongodb+srv://<username>:<password>@<cluster-url>"
MONGODB_DB_NAME="cinema"
RESERVATION_TIMEOUT_MINUTES=15

STRIPE_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_TICKET_PRICE_MINOR=3000
STRIPE_CURRENCY="pln"
```

Notes:
- `STRIPE_TICKET_PRICE_MINOR=3000` means 30.00 in selected currency.
- Keep Stripe in **Test mode** for sandbox testing.

## 3) Stripe local webhook setup

Install Stripe CLI (once), then:

```bash
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook --events checkout.session.completed,payment_intent.succeeded,payment_intent.payment_failed
```

Copy the printed `whsec_...` and set it as `STRIPE_WEBHOOK_SECRET` in `.env.local`.
Restart `npm run dev` after changing env vars.

Optional test event:

```bash
stripe trigger checkout.session.completed
```

## 4) Test payment flow locally

1. Choose event and seat in the app.
2. Create reservation.
3. Click **Przejdź do płatności Stripe**.
4. Pay with Stripe test card:
   - `4242 4242 4242 4242`
   - any future expiry
   - any CVC / ZIP
5. After success, webhook confirms purchase.

## 5) Vercel hosted setup (sandbox)

In Vercel project env vars set:
- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_TICKET_PRICE_MINOR`
- `STRIPE_CURRENCY`
- MongoDB vars used by the app

In Stripe Dashboard (Test mode), create webhook endpoint:

```text
https://your-app.vercel.app/api/stripe/webhook
```

Use `checkout.session.completed` at minimum.
Copy that endpoint's `whsec_...` into Vercel `STRIPE_WEBHOOK_SECRET`, then redeploy.

## 6) API endpoints used for payments

- `POST /api/stripe/checkout-session`
- `POST /api/stripe/webhook`

