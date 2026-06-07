import { hashPassword, verifyPassword } from "../../auth/password.js";
import { generateToken, hashToken } from "../../auth/tokens.js";
import { normalizeName } from "../../shared/normalize.js";

// Single-use emailed-token types stored in the `auth_tokens` table.
export const TOKEN_TYPES = { VERIFICATION: "email_verification", RESET: "password_reset" };

const VERIFICATION_TTL_SECONDS = 24 * 60 * 60; // 24h
const RESET_TTL_SECONDS = 60 * 60; // 1h
const MIN_PASSWORD_LENGTH = 8;

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

export async function loginUser(repositories, emailInput, passwordInput) {
  const email = normalizeName(emailInput).toLowerCase();
  const user = await repositories.auth.findUserByEmail(email);
  if (!user || !user.passwordSalt || !user.passwordHash || !verifyPassword(String(passwordInput || ""), user.passwordSalt, user.passwordHash)) {
    return { error: "Invalid email or password.", errorKey: "errors.invalidCredentials", status: 401 };
  }
  return { user };
}

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

// Issue a fresh email-verification token, superseding any outstanding ones, and
// return the raw token for emailing. The raw value is never persisted.
export async function createVerificationToken(repositories, userId) {
  await repositories.auth.deleteUserTokensOfType(userId, TOKEN_TYPES.VERIFICATION);
  const { raw, hash } = generateToken();
  await repositories.auth.createAuthToken(hash, userId, TOKEN_TYPES.VERIFICATION, expiresAtIso(VERIFICATION_TTL_SECONDS));
  return raw;
}

// Consume a verification token and mark the user verified. Idempotent-ish: an
// already-verified user re-clicking a stale link gets a clear error.
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

// Begin a password reset. Always resolves without revealing whether the email
// exists (no account enumeration); callers send mail only when `user` is set.
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

// Consume a reset token and set a new password. Revokes every existing session
// for the account so a leaked cookie cannot survive a reset.
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

// Change the password for a signed-in user after verifying their current one.
// Caller is responsible for revoking other sessions and reissuing the current.
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
    await repositories.auth.markEmailVerified(user.id);
    user = await repositories.auth.findUserByEmail(email);
  }

  await repositories.auth.createOAuthAccount(user.id, provider, providerUserId, email, profile.displayName || "");
  return { user };
}
