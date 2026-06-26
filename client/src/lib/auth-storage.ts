// Access token persistence. Stored in localStorage so it survives a page reload;
// on load the app re-validates it by calling /api/auth/me (see AuthContext).
const KEY = "auction.token";

export function getToken(): string | null {
  return localStorage.getItem(KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(KEY);
}
