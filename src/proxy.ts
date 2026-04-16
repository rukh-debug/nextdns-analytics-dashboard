import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "ndns_session";

function getSessionKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET ?? "";
  return new TextEncoder().encode(secret);
}

function isAuthEnabled(): boolean {
  return !!(
    process.env.AUTH_USER &&
    process.env.AUTH_PASSWORD &&
    process.env.SESSION_SECRET
  );
}

export async function proxy(request: NextRequest) {
  // If auth is not configured, allow all traffic through
  if (!isAuthEnabled()) return NextResponse.next();

  const { pathname } = request.nextUrl;

  // Public paths that never require auth
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/api/health"
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  let authenticated = false;

  if (token) {
    try {
      await jwtVerify(token, getSessionKey());
      authenticated = true;
    } catch {
      authenticated = false;
    }
  }

  if (!authenticated) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|favicon\\.png|.*\\.png$).*)"],
};
