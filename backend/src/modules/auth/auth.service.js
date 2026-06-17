/**
 * @fileoverview Auth service. Business logic for user registration, login,
 * email verification, password reset/change, OAuth sign-in, and account
 * deletion. Coordinates with the auth repository and, for account deletion,
 * the database repository's transaction helper.
 */

import { hashPassword, verifyPassword } from "../../auth/password.js";
import { generateToken, hashToken } from "../../auth/tokens.js";
import { normalizeName } from "../../shared/normalize.js";

// Single-use emailed-token types stored in the `auth_tokens` table.
export const TOKEN_TYPES = { VERIFICATION: "email_verification", RESET: "password_reset" };

const VERIFICATION_TTL_SECONDS = 24 * 60 * 60; // 24h
const RESET_TTL_SECONDS = 60 * 60; // 1h
const MIN_PASSWORD_LENGTH = 8;
const PASSWORD_NUMBER_PATTERN = /\d/;

// Pragmatic email shape check: a single @, non-empty local part, and a dotted
// domain. Real deliverability is confirmed by the verification email itself.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  return EMAIL_PATTERN.test(email);
}

// Returns an error descriptor when the password fails policy, else null.
function passwordError(password) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, errorKey: "errors.passwordTooShort", status: 400 };
  }
  if (!PASSWORD_NUMBER_PATTERN.test(password)) {
    return { error: "Password must include at least one number.", errorKey: "errors.passwordRequiresNumber", status: 400 };
  }
  return null;
}

function expiresAtIso(ttlSeconds) {
  return new Date(Date.now() + ttlSeconds * 1000).toISOString();
}

// A stored token row is usable only if it was never consumed and has not expired.
function isTokenUsable(row) {
  if (!row || row.usedAt) {
    return false;
  }
  return new Date(row.expiresAt).getTime() > Date.now();
}

/**
 * Build the auth context payload returned after sign-in and on session refresh.
 * Fetches the user profile, enrolled languages, and the predefined language list.
 * Coordinates with: auth repository, languages repository.
 *
 * @param {object} repositories - The wired repository map.
 * @param {number} userId
 * @returns {Promise<{ user: object, languages: object[], predefinedLanguages: object[], needsOnboarding: boolean }>}
 */
export async function getAuthContext(repositories, userId) {
  const languages = await repositories.languages.listForUser(userId);
  const profile = await repositories.auth.findUserById(userId);
  return {
    user: {
      id: userId,
      email: profile.email,
      displayName: profile.displayName || "",
      createdAt: profile.createdAt,
      nativeLanguage: profile.nativeLanguage,
      practiceWordsPerSession: profile.practiceWordsPerSession,
      emailVerified: profile.emailVerified === true,
      hasPassword: profile.hasPassword === true,
      hasGoogle: profile.hasGoogle === true
    },
    languages,
    predefinedLanguages: await repositories.languages.listPredefined(),
    needsOnboarding: languages.length === 0
  };
}

/**
 * Verify email/password credentials and return the matching user row.
 *
 * @param {object} repositories
 * @param {string} emailInput
 * @param {string} passwordInput
 * @returns {Promise<{ user: object }|{ error: string, errorKey: string, status: number }>}
 *   Returns `{ user }` on success, or an error descriptor with HTTP status 401 on failure.
 */
export async function loginUser(repositories, emailInput, passwordInput) {
  const email = normalizeName(emailInput).toLowerCase();
  const user = await repositories.auth.findUserByEmail(email);
  if (!user || !user.passwordSalt || !user.passwordHash || !verifyPassword(String(passwordInput || ""), user.passwordSalt, user.passwordHash)) {
    return { error: "Invalid email or password.", errorKey: "errors.invalidCredentials", status: 401 };
  }
  return { user };
}

/**
 * Create a new password-based user account after validating email format,
 * password policy, confirmation match, and uniqueness.
 *
 * @param {object} repositories
 * @param {string} emailInput
 * @param {string} passwordInput
 * @param {string} confirmPasswordInput
 * @returns {Promise<{ user: object }|{ error: string, errorKey: string, status: number }>}
 *   Returns `{ user }` on success. Status 400 for validation failures; 409 when email exists.
 */
export async function registerUser(repositories, emailInput, passwordInput, confirmPasswordInput) {
  const email = normalizeName(emailInput).toLowerCase();
  const password = String(passwordInput || "");
  const confirmPassword = String(confirmPasswordInput || "");
  if (!email || !password || password !== confirmPassword) {
    return { error: "Email, password, and matching confirmation are required.", errorKey: "errors.registrationFieldsRequired", status: 400 };
  }
  if (!isValidEmail(email)) {
    return { error: "Enter a valid email address.", errorKey: "errors.invalidEmail", status: 400 };
  }
  const policyError = passwordError(password);
  if (policyError) {
    return policyError;
  }
  if (await repositories.auth.findUserByEmail(email)) {
    return { error: "User already exists.", errorKey: "errors.userAlreadyExists", status: 409 };
  }
  const passwordHash = hashPassword(password);
  await repositories.auth.createUser(email, passwordHash.hash, passwordHash.salt);
  const user = await repositories.auth.findUserByEmail(email);
  return { user };
}

/**
 * Issue a fresh email-verification token, superseding any outstanding ones.
 * Returns the raw token to be included in the verification email link; the raw
 * value is never stored — only its SHA-256 hash is persisted.
 *
 * @param {object} repositories
 * @param {number} userId
 * @returns {Promise<string>} Raw token (24h TTL).
 */
export async function createVerificationToken(repositories, userId) {
  await repositories.auth.deleteUserTokensOfType(userId, TOKEN_TYPES.VERIFICATION);
  const { raw, hash } = generateToken();
  await repositories.auth.createAuthToken(hash, userId, TOKEN_TYPES.VERIFICATION, expiresAtIso(VERIFICATION_TTL_SECONDS));
  return raw;
}

/**
 * Consume an email-verification token and mark the associated account verified.
 * The token is stamped used on success so it cannot be replayed.
 *
 * @param {object} repositories
 * @param {string} rawToken - The raw token from the email link.
 * @returns {Promise<{ userId: number }|{ error: string, errorKey: string, status: 400 }>}
 */
export async function verifyEmail(repositories, rawToken) {
  const id = hashToken(String(rawToken || ""));
  const row = await repositories.auth.findAuthToken(id, TOKEN_TYPES.VERIFICATION);
  if (!isTokenUsable(row)) {
    return { error: "This verification link is invalid or has expired.", errorKey: "errors.verificationLinkInvalid", status: 400 };
  }
  await repositories.auth.markEmailVerified(row.userId);
  await repositories.auth.markAuthTokenUsed(id);
  return { userId: row.userId };
}

/**
 * Begin a password-reset flow by issuing a reset token. Always resolves
 * without revealing whether the email exists (no account enumeration).
 * Callers should send the reset email only when the returned `user` is set.
 * Only accounts that already have a password can receive a reset token.
 *
 * @param {object} repositories
 * @param {string} emailInput
 * @returns {Promise<{ user: object|null, raw?: string }>}
 *   `raw` is the raw token (1h TTL); `user` is null when the email is unknown
 *   or is OAuth-only.
 */
export async function createPasswordReset(repositories, emailInput) {
  const email = normalizeName(emailInput).toLowerCase();
  const user = await repositories.auth.findUserByEmail(email);
  if (!user || !user.passwordHash || !user.passwordSalt) {
    return { user: null };
  }
  await repositories.auth.deleteUserTokensOfType(user.id, TOKEN_TYPES.RESET);
  const { raw, hash } = generateToken();
  await repositories.auth.createAuthToken(hash, user.id, TOKEN_TYPES.RESET, expiresAtIso(RESET_TTL_SECONDS));
  return { user, raw };
}

/**
 * Consume a password-reset token and set the new password. All existing
 * sessions for the account are revoked so a leaked cookie cannot survive the reset.
 *
 * @param {object} repositories
 * @param {string} rawToken - Raw reset token from the email link.
 * @param {string} passwordInput
 * @param {string} confirmPasswordInput
 * @returns {Promise<{ userId: number }|{ error: string, errorKey: string, status: number }>}
 */
export async function resetPassword(repositories, rawToken, passwordInput, confirmPasswordInput) {
  const password = String(passwordInput || "");
  const confirmPassword = String(confirmPasswordInput || "");
  const id = hashToken(String(rawToken || ""));
  const row = await repositories.auth.findAuthToken(id, TOKEN_TYPES.RESET);
  if (!isTokenUsable(row)) {
    return { error: "This reset link is invalid or has expired.", errorKey: "errors.resetLinkInvalid", status: 400 };
  }
  const policyError = passwordError(password);
  if (policyError) {
    return policyError;
  }
  if (password !== confirmPassword) {
    return { error: "Passwords do not match.", errorKey: "errors.passwordConfirmationMismatch", status: 400 };
  }
  const passwordHash = hashPassword(password);
  await repositories.auth.updatePassword(passwordHash.hash, passwordHash.salt, row.userId);
  await repositories.auth.markAuthTokenUsed(id);
  await repositories.auth.deleteUserSessions(row.userId);
  return { userId: row.userId };
}

/**
 * Change the password for an already-authenticated user. Verifies the current
 * password before accepting the new one. The caller is responsible for
 * revoking other sessions and reissuing the active one.
 *
 * @param {object} repositories
 * @param {number} userId
 * @param {string} currentInput - Current password for verification.
 * @param {string} nextInput - New password.
 * @param {string} confirmInput - Must match `nextInput`.
 * @returns {Promise<{ userId: number }|{ error: string, errorKey: string, status: number }>}
 */
export async function changePassword(repositories, userId, currentInput, nextInput, confirmInput) {
  const current = String(currentInput || "");
  const next = String(nextInput || "");
  const confirm = String(confirmInput || "");
  const profile = await repositories.auth.findUserSecretById(userId);
  if (!profile || !profile.passwordSalt || !profile.passwordHash || !verifyPassword(current, profile.passwordSalt, profile.passwordHash)) {
    return { error: "Your current password is incorrect.", errorKey: "errors.currentPasswordIncorrect", status: 400 };
  }
  const policyError = passwordError(next);
  if (policyError) {
    return policyError;
  }
  if (next !== confirm) {
    return { error: "Passwords do not match.", errorKey: "errors.passwordConfirmationMismatch", status: 400 };
  }
  const passwordHash = hashPassword(next);
  await repositories.auth.updatePassword(passwordHash.hash, passwordHash.salt, userId);
  return { userId };
}

/**
 * Permanently delete a user account and all associated private data. Requires
 * the user to type their email address as confirmation. Shared catalogue data
 * (global words, translations, languages) is preserved for other users.
 * Runs inside a transaction via the database repository.
 *
 * @param {object} repositories
 * @param {number} userId
 * @param {string} confirmationInput - Must equal the user's email address.
 * @returns {Promise<{ deleted: true }|{ error: string, errorKey: string, status: number }>}
 */
export async function deleteAccount(repositories, userId, confirmationInput) {
  const profile = await repositories.auth.findUserById(userId);
  if (!profile) {
    return { error: "Authentication required.", errorKey: "errors.authenticationRequired", status: 401 };
  }
  const confirmation = normalizeName(confirmationInput).toLowerCase();
  if (confirmation !== String(profile.email || "").toLowerCase()) {
    return {
      error: "Enter your email address to confirm account deletion.",
      errorKey: "errors.accountDeletionConfirmationMismatch",
      status: 400
    };
  }
  await repositories.database.transaction((tx) => tx.auth.deleteUserAccountData(userId));
  return { deleted: true };
}

/**
 * Sign in or register using a verified OAuth profile. Handles four cases:
 * (1) existing OAuth account link → return the linked user;
 * (2) no OAuth link but email matches an existing verified account → link and return;
 * (3) no OAuth link and email matches an unverified password account → clear the
 *   unproven password (pre-hijack defence), verify, link, and return;
 * (4) no match at all → create a new OAuth-only user, link, and return.
 *
 * @param {object} repositories
 * @param {{ providerUserId: string, email: string, emailVerified: boolean, displayName?: string }} profile
 * @returns {Promise<{ user: object }|{ error: string, errorKey: string, status: number }>}
 */
export async function loginWithOAuthProfile(repositories, profile) {
  const provider = "google";
  const providerUserId = String(profile.providerUserId || "");
  const email = normalizeName(profile.email).toLowerCase();
  if (!providerUserId || !email || !profile.emailVerified || !isValidEmail(email)) {
    return { error: "Google did not return a verified email address.", errorKey: "errors.googleEmailUnverified", status: 400 };
  }

  const account = await repositories.auth.findOAuthAccount(provider, providerUserId);
  if (account) {
    const linkedUser = await repositories.auth.findUserById(account.userId);
    if (!linkedUser) {
      return { error: "Linked account was not found.", errorKey: "errors.requestFailed", status: 500 };
    }
    return { user: linkedUser };
  }

  let user = await repositories.auth.findUserByEmail(email);
  if (!user) {
    await repositories.auth.createOAuthUser(email);
    user = await repositories.auth.findUserByEmail(email);
  } else if (user.emailVerified !== true) {
    // Pre-hijack defence: an unverified password account with this email may
    // have been registered by someone other than the rightful email owner.
    // Google has verified the email, so trust the OAuth login as the owner and
    // drop the unproven password and any sessions created with it.
    if (user.passwordHash || user.passwordSalt) {
      await repositories.auth.clearPassword(user.id);
      await repositories.auth.deleteUserSessions(user.id);
    }
    await repositories.auth.markEmailVerified(user.id);
    user = await repositories.auth.findUserByEmail(email);
  }

  await repositories.auth.createOAuthAccount(user.id, provider, providerUserId, email, profile.displayName || "");
  return { user };
}
