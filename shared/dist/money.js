import { z } from "zod";
// Money crosses the wire as a STRING in crore units (Decimal(14,2)) — never a JS
// number. At most 2 decimal places; any extra precision is rounded half-up at the
// validation boundary so users can type freely. The server re-rounds with
// decimal.js as the authoritative source of truth.
export const MONEY_REGEX = /^\d{1,10}(\.\d{1,8})?$/;
/**
 * Round a non-negative decimal STRING to 2 places, half-up, with no floats.
 * Works on the regex-validated shape `\d{1,10}(\.\d{1,8})?`. Uses BigInt so the
 * scaling is exact (we never parse money into a JS `number`).
 */
export function roundMoneyString(value) {
    const [intPart, frac = ""] = value.split(".");
    if (frac.length <= 2)
        return value;
    // Scale to integer hundredths, then round half-up on the 3rd decimal digit.
    const scaled = BigInt(intPart + frac.slice(0, 2));
    const rounded = frac.charCodeAt(2) >= 53 /* '5' */ ? scaled + 1n : scaled;
    const digits = rounded.toString().padStart(3, "0");
    return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}
export const moneyString = z
    .string()
    .trim()
    .regex(MONEY_REGEX, "Enter a valid amount")
    .transform(roundMoneyString);
/** Money string that must be strictly greater than zero (e.g. credit per team). */
export const positiveMoneyString = moneyString.refine((v) => Number(v) > 0, {
    message: "Amount must be greater than zero",
});
