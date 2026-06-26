import { z } from "zod";
export declare const MONEY_REGEX: RegExp;
export declare const moneyString: z.ZodString;
/** Money string that must be strictly greater than zero (e.g. credit per team). */
export declare const positiveMoneyString: z.ZodEffects<z.ZodString, string, string>;
