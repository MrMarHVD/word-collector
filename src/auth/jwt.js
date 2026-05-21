import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { JWT_SECRET_PATH, JWT_TTL_SECONDS } from "../config.js";

async function getJwtSecret() {
  if (existsSync(JWT_SECRET_PATH)) {
    return (await readFile(JWT_SECRET_PATH, "utf8")).trim();
  }
  const secret = randomBytes(48).toString("base64url");
  await writeFile(JWT_SECRET_PATH, `${secret}\n`, { mode: 0o600 });
  return secret;
}

const JWT_SECRET = await getJwtSecret();

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signJwt(header, payload) {
  const data = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signature = createHmac("sha256", JWT_SECRET).update(data).digest("base64url");
  return `${data}.${signature}`;
}

export function createJwt(user) {
  const now = Math.floor(Date.now() / 1000);
  return signJwt(
    { alg: "HS256", typ: "JWT" },
    {
      sub: String(user.id),
      email: user.email,
      iat: now,
      exp: now + JWT_TTL_SECONDS,
      jti: randomBytes(16).toString("hex")
    }
  );
}

export function verifyJwt(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const data = `${encodedHeader}.${encodedPayload}`;
  const expected = createHmac("sha256", JWT_SECRET).update(data).digest("base64url");
  const actual = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actual.length !== expectedBuffer.length || !timingSafeEqual(actual, expectedBuffer)) {
    return null;
  }

  try {
    const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== "HS256" || header.typ !== "JWT" || !payload.sub || !payload.exp || payload.exp <= now) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
