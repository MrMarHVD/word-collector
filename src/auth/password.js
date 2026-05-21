import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = pbkdf2Sync(password, salt, 120_000, 32, "sha256").toString("hex");
  return { salt, hash };
}

export function verifyPassword(password, salt, expectedHash) {
  const actual = pbkdf2Sync(password, salt, 120_000, 32, "sha256");
  const expected = Buffer.from(expectedHash, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
