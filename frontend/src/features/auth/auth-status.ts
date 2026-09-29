/** Pure helpers for the auth screens and the verification banner. */

import type { User } from "@/lib/api/types";

/** Whether the verification banner shows: signed in and the email is not verified yet. */
export function needsEmailVerification(user: Pick<User, "emailVerified"> | null): boolean {
  return Boolean(user) && user?.emailVerified !== true;
}
