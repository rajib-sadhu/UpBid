import bcrypt from "bcryptjs";

// bcryptjs produces standard $2b$ hashes (same algorithm as native bcrypt).
// A server-wide PEPPER is appended to every password before hashing/verifying,
// so a leaked DB alone can't be brute-forced without the secret.
const ROUNDS = 12;

function withPepper(plain: string): string {
  return plain + (process.env.PEPPER ?? "");
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(withPepper(plain), ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(withPepper(plain), hash);
}
