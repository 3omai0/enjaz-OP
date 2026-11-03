import { jwtVerify, SignJWT } from "jose";
import type { UserRole } from "@/db/schema";

export const SESSION_COOKIE = "injaz_session";
export const SESSION_DAYS = 7;

export type SessionPayload = {
  sub: string;
  role: UserRole;
  name: string;
  email: string;
  /** The user's session version when the token was issued; see users.sessionVersion. */
  sv: number;
};

const MIN_SECRET_LENGTH = 32;
let cachedKey: Uint8Array | null = null;

/**
 * The signing key. There is deliberately no fallback: a missing or short
 * secret stops the app with a clear message instead of signing sessions with
 * a value anyone could read in the source code.
 */
function secretKey() {
  if (cachedKey) return cachedKey;
  const raw = process.env.AUTH_SECRET?.trim();
  if (!raw || raw.length < MIN_SECRET_LENGTH) {
    throw new Error(`AUTH_SECRET is missing or shorter than ${MIN_SECRET_LENGTH} characters. Add a long random value to .env (see README).`);
  }
  cachedKey = new TextEncoder().encode(raw);
  return cachedKey;
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ role: payload.role, name: payload.name, email: payload.email, sv: payload.sv })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  const key = secretKey();
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      role: payload.role as UserRole,
      name: String(payload.name ?? ""),
      email: String(payload.email ?? ""),
      sv: typeof payload.sv === "number" ? payload.sv : 0,
    };
  } catch {
    return null;
  }
}
