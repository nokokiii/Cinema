// GET /api/loyalty?email=... - Returns the customer's current loyalty points balance
import { NextResponse } from "next/server";
import { getLoyaltyProvider } from "@/app/lib/loyalty";
import { isValidEmail } from "@/app/lib/validation";
import { enforceRateLimit } from "@/app/lib/rate-limit";
import { apiError } from "@/app/lib/api-errors";

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "loyalty");
  if (limited) return limited;

  const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase() ?? "";
  if (!isValidEmail(email)) {
    return apiError(400, "Invalid or missing email");
  }

  try {
    const points = await getLoyaltyProvider().getBalance(email);
    return NextResponse.json({ email, points });
  } catch (error) {
    console.error("Failed to fetch loyalty balance:", error);
    return apiError(500, "Failed to fetch loyalty balance");
  }
}
