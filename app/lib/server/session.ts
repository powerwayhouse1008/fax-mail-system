import { createHmac, timingSafeEqual } from "crypto";
import { ADMIN_CREDENTIAL, AUTH_COOKIE_NAME, type SessionUser } from "../auth";

const SESSION_TTL_SECONDS = 60 * 60 * 12;

type SessionPayload = {
  username: string;
  role: SessionUser["role"];
  exp: number;
};

const base64UrlEncode = (value: string) => Buffer.from(value, "utf-8").toString("base64url");

const base64UrlDecode = (value: string) => Buffer.from(value, "base64url").toString("utf-8");

const getSecret = () => process.env.AUTH_SESSION_SECRET || "dev-only-change-this-secret";

const sign = (payload: string) =>
  createHmac("sha256", getSecret()).update(payload).digest("base64url");

export function createSessionToken(user: SessionUser): string {
  const payload: SessionPayload = {
    username: user.username,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string | undefined): SessionUser | null {
  if (!token) return null;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = sign(encodedPayload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;

    return {
      username: payload.username,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

export function getSessionCookieAttributes(maxAge = SESSION_TTL_SECONDS): string {
  return `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`;
}

export function isAdminUser(username: string): boolean {
  return username === ADMIN_CREDENTIAL.username;
}
