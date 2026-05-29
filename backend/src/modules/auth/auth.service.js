import { hashPassword, verifyPassword } from "../../auth/password.js";
import { normalizeName } from "../../shared/normalize.js";

export async function getAuthContext(repositories, userId) {
  const languages = await repositories.languages.listForUser(userId);
  const profile = await repositories.auth.findUserById(userId);
  return {
    user: { id: userId, email: profile.email, nativeLanguage: profile.nativeLanguage, practiceWordsPerSession: profile.practiceWordsPerSession },
    languages,
    predefinedLanguages: await repositories.languages.listPredefined(),
    needsOnboarding: languages.length === 0
  };
}

export async function loginUser(repositories, emailInput, passwordInput) {
  const email = normalizeName(emailInput).toLowerCase();
  const user = await repositories.auth.findUserByEmail(email);
  if (!user || !verifyPassword(String(passwordInput || ""), user.passwordSalt, user.passwordHash)) {
    return { error: "Invalid email or password.", status: 401 };
  }
  return { user };
}

export async function registerUser(repositories, emailInput, passwordInput, confirmPasswordInput) {
  const email = normalizeName(emailInput).toLowerCase();
  const password = String(passwordInput || "");
  const confirmPassword = String(confirmPasswordInput || "");
  if (!email || !password || password !== confirmPassword) {
    return { error: "Email, password, and matching confirmation are required.", status: 400 };
  }
  if (await repositories.auth.findUserByEmail(email)) {
    return { error: "User already exists.", status: 409 };
  }
  const passwordHash = hashPassword(password);
  await repositories.auth.createUser(email, passwordHash.hash, passwordHash.salt);
  const user = await repositories.auth.findUserByEmail(email);
  return { user };
}
