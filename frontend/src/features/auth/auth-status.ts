/** Pure helpers for the auth screens and the verification banner. */

import type { User } from "@/lib/api/types";

/** Status text for a failed auth request: the (already localised) ApiError message, or the thrown value as text. */
export function authErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Whether the verification banner shows: signed in and the email is not verified yet. */
export function needsEmailVerification(user: Pick<User, "emailVerified"> | null): boolean {
  return Boolean(user) && user?.emailVerified !== true;
}
