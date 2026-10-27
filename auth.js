import jwt from "jsonwebtoken";

export const SESSION_COOKIE = "piura_circular_session";
export const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("La variable de entorno JWT_SECRET no está configurada.");
  }
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("JWT_SECRET debe tener al menos 32 bytes.");
  }
  return secret;
}

export function assertJwtSecretConfigured() {
  getJwtSecret();
}

export function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

export function methodNotAllowed(response, allowedMethods) {
  response.setHeader("Allow", allowedMethods.join(", "));
  sendJson(response, 405, { error: "Método no permitido." });
}

export function readJsonBody(request) {
  const contentType = request.headers["content-type"] || "";
  const rawBody = Buffer.isBuffer(request.body)
    ? request.body.toString("utf8")
    : request.body;
  if (typeof rawBody === "string") {
    if (contentType.includes("application/x-www-form-urlencoded")) {
      return Object.fromEntries(new URLSearchParams(rawBody));
    }
    return JSON.parse(rawBody);
  }
  return rawBody && typeof rawBody === "object" ? rawBody : {};
}

export function createSessionToken(userId) {
  return jwt.sign({ sub: String(userId) }, getJwtSecret(), {
    algorithm: "HS256",
    expiresIn: SESSION_DURATION_SECONDS,
  });
}

export function setSessionCookie(response, token) {
  const secure =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production";
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DURATION_SECONDS}${secure ? "; Secure" : ""}`,
  );
}

export function clearSessionCookie(response) {
  const secure =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production";
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure ? "; Secure" : ""}`,
  );
}

export function readSessionUserId(request) {
  const cookieHeader = request.headers.cookie || "";
  const sessionCookie = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
  if (!sessionCookie) return null;

  const token = sessionCookie.slice(SESSION_COOKIE.length + 1);
  const payload = jwt.verify(token, getJwtSecret(), {
    algorithms: ["HS256"],
  });
  if (typeof payload === "string" || typeof payload.sub !== "string") {
    return null;
  }
  return payload.sub;
}
