import { z } from "zod";

// Money crosses the wire as a STRING in crore units (Decimal(14,4)) — never a JS
// number. Up to 4 decimal places, non-negative. The server parses to Prisma.Decimal.
export const MONEY_REGEX = /^\d{1,10}(\.\d{1,4})?$/;

export const moneyString = z
  .string()
  .trim()
  .regex(MONEY_REGEX, "Enter a valid amount (up to 4 decimals)");

/** Money string that must be strictly greater than zero (e.g. credit per team). */
export const positiveMoneyString = moneyString.refine((v) => Number(v) > 0, {
  message: "Amount must be greater than zero",
});
