import { z } from "zod";
export declare const MONEY_REGEX: RegExp;
/**
 * Round a non-negative decimal STRING to 2 places, half-up, with no floats.
 * Works on the regex-validated shape `\d{1,10}(\.\d{1,8})?`. Uses BigInt so the
 * scaling is exact (we never parse money into a JS `number`).
 */
export declare function roundMoneyString(value: string): string;
export declare const moneyString: z.ZodEffects<z.ZodString, string, string>;
/** Money string that must be strictly greater than zero (e.g. credit per team). */
export declare const positiveMoneyString: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
