import { normalizeUrl, type Session } from "./api/client";

export const SESSION_STORAGE_KEY = "legacy-link.account-session.v1";
export type StoredSession = { base: string; token: string };

export function forgetSession() {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* Storage may be unavailable. */
  }
}

export function readSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (
      typeof value?.base !== "string" ||
      typeof value?.token !== "string" ||
      !value.token ||
      value.token.length > 512
    )
      throw new Error("Invalid stored session");
    return { base: normalizeUrl(value.base), token: value.token };
  } catch {
    forgetSession();
    return null;
  }
}

export function rememberSession(session: Session) {
  // Preserve account sessions for this tab only; roles always come from /auth/me.
  if (!session.user) {
    forgetSession();
    return;
  }
  try {
    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ base: session.base, token: session.readToken }),
    );
  } catch {
    /* Sign-in still works when browser storage is blocked. */
  }
}
