import { Prisma } from "@prisma/client";

// All monetary amounts are Decimal(14,4) in CRORE units (0.5 = 50 lakh).
// Money is NEVER a JS `number` on the wire — it crosses the network as a string
// and lives as Prisma.Decimal (decimal.js) on the server. These helpers keep
// the reserve math (Phase 5) and money display exact.

export type Money = Prisma.Decimal;
export type MoneyInput = string | number | Prisma.Decimal;

export const ZERO: Money = new Prisma.Decimal(0);

/** Construct a Money value. Accept number ONLY for trusted config/seed input. */
export function money(value: MoneyInput): Money {
  return new Prisma.Decimal(value);
}

/** Serialize for the wire: a fixed 4-decimal string, never a float. */
export function moneyToWire(value: Money): string {
  return value.toFixed(4);
}

export function add(a: Money, b: Money): Money {
  return a.add(b);
}

export function sub(a: Money, b: Money): Money {
  return a.sub(b);
}

export function mul(a: Money, factor: MoneyInput): Money {
  return a.mul(factor);
}

/** Larger of two amounts (used by the reserve math's max(0, ...) clamp). */
export function maxMoney(a: Money, b: Money): Money {
  return a.greaterThan(b) ? a : b;
}

export function gte(a: Money, b: Money): boolean {
  return a.greaterThanOrEqualTo(b);
}

export function lte(a: Money, b: Money): boolean {
  return a.lessThanOrEqualTo(b);
}

export function eq(a: Money, b: Money): boolean {
  return a.equals(b);
}
