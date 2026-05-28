import { hashPassword, verifyPassword } from "../../auth/password.js";
import { normalizeName } from "../../shared/normalize.js";

export function getAuthContext(repositories, userId) {
  const languages = repositories.languages.listForUser(userId);
  const profile = repositories.auth.findUserById(userId);
  return {
    user: { id: userId, email: profile.email, nativeLanguage: profile.nativeLanguage, practiceWordsPerSession: profile.practiceWordsPerSession },
    languages,
    predefinedLanguages: repositories.languages.listPredefined(),
    needsOnboarding: languages.length === 0
  };
}

export function loginUser(repositories, emailInput, passwordInput) {
  const email = normalizeName(emailInput).toLowerCase();
  const user = repositories.auth.findUserByEmail(email);
  if (!user || !verifyPassword(String(passwordInput || ""), user.passwordSalt, user.passwordHash)) {
    return { error: "Invalid email or password.", status: 401 };
  }
  return { user };
}

export function registerUser(repositories, emailInput, passwordInput, confirmPasswordInput) {
  const email = normalizeName(emailInput).toLowerCase();
  const password = String(passwordInput || "");
  const confirmPassword = String(confirmPasswordInput || "");
  if (!email || !password || password !== confirmPassword) {
    return { error: "Email, password, and matching confirmation are required.", status: 400 };
  }
  if (repositories.auth.findUserByEmail(email)) {
    return { error: "User already exists.", status: 409 };
  }
  const passwordHash = hashPassword(password);
  repositories.auth.createUser(email, passwordHash.hash, passwordHash.salt);
  const user = repositories.auth.findUserByEmail(email);
  return { user };
}
