# Cinema Ticket Booking System (PAS S01 - Etap I)

A modern cinema ticket booking application built with **Next.js 16 (App Router)**, **TypeScript**, **Tailwind CSS**, and **MongoDB**.

---

## 🚀 Features & Architecture

Implements the **Etap I** contract specified by the CEO:
- **Card A (Repertoire & Hall Map)**: Screenings list and an interactive 8×10 cinema hall seating map with screen at the top, rows A–H and numbered seats 1–10. Occupied/held seats are grayed out.
- **Card B (Seat Reservation)**: Seat reservation form with client name and email. Holds the seat for 15 minutes (or 2 minutes during test runs) with a live countdown timer.
- **Card C (Ticket Purchase)**: Instant ticket confirmation with a unique ticket code. If 15 minutes elapse before purchase, the reservation expires and the seat returns to the pool.
- **High Reliability Dual-Mode Storage**: Seamlessly connects to MongoDB when available and automatically falls back to a resilient in-memory store if network or Atlas IP restrictions block connection.

---

## 📜 API Contract

The application implements the standardized shared API contract:

| Card | Method & Endpoint | Payload | Returns | Description |
|---|---|---|---|---|
| **A** | `GET /api/events` | - | `EventDocument[]` | List of all screenings |
| **A** | `GET /api/events/:id` | - | `{ event, takenSeats: string[] }` | Event details and currently occupied/held seat IDs |
| **B** | `POST /api/reservations` | `{ eventId, seatId, customerName, email }` | `{ reservationId, expiresAt, code }` | Reserves a seat for 15 minutes |
| **C** | `POST /api/reservations/:id/purchase` | - | `{ code }` (or `410` if expired) | Confirms ticket purchase and issues ticket code |
| **C** | `GET /api/reservations/:id` | - | `{ reservation, event, isExpired }` | Retrieves ticket and reservation details |

### Frontend Pages:
- `/` – Cinema repertoire and screening list
- `/events/:id` – Seating chart and seat selection
- `/reserve?eventId=...&seatId=...` – Reservation form, live countdown timer & purchase button
- `/reservations/:code` – Digital ticket confirmation screen

---

## 🛠️ Configuration & Environment Variables

Copy `.env.sample` to `.env.local` or `.env`:

```bash
cp .env.sample .env.local
```

### Variables:
- `MONGODB_URI`: MongoDB connection string (Atlas or local `mongodb://localhost:27017/cinema`).
- `MONGODB_DB_NAME`: Database name (defaults to `cinema`).
- `RESERVATION_TIMEOUT_MINUTES`: Reservation holding duration in minutes (defaults to `15`, set to `2` during testing).

> **Note on MongoDB Atlas**: Ensure your IP address (or `0.0.0.0/0` for universal access) is added to the MongoDB Atlas **Network Access** IP Allowlist. If Atlas is unreachable, the system automatically falls back to an internal store so the app remains fully functional.

---

## 💻 Getting Started

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

To run the production build:

```bash
npm run build
npm start
```
