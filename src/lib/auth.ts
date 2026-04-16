import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "ndns_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours

function getSessionKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET environment variable is not set");
  return new TextEncoder().encode(secret);
}

export function isAuthEnabled(): boolean {
  return !!(
    process.env.AUTH_USER &&
    process.env.AUTH_PASSWORD &&
    process.env.SESSION_SECRET
  );
}

export async function createSessionToken(username: string): Promise<string> {
  return new SignJWT({ username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSessionKey());
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getSessionKey());
    return true;
  } catch {
    return false;
  }
}
