import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFile } from "node:fs/promises";
import jwt from "jsonwebtoken";
import register from "../api/registro.js";
import login from "../api/login.js";
import logout from "../api/logout.js";
import currentUser from "../api/me.js";
import {
  SESSION_COOKIE,
  SESSION_DURATION_SECONDS,
  createSessionToken,
  readJsonBody,
  readSessionUserId,
  setSessionCookie,
} from "../auth.js";

const originalJwtSecret = process.env.JWT_SECRET;
const originalNodeEnv = process.env.NODE_ENV;
const originalVercelEnv = process.env.VERCEL_ENV;
const rootDirectory = new URL("../", import.meta.url);
process.env.JWT_SECRET = "test-secret-with-at-least-32-bytes-long";
delete process.env.NODE_ENV;
delete process.env.VERCEL_ENV;

after(() => {
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = originalVercelEnv;
});

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: "",
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(body) {
      this.body = body;
    },
    json() {
      return this.body ? JSON.parse(this.body) : null;
    },
  };
}

async function call(handler, { method = "GET", body, headers = {} } = {}) {
  const response = createResponse();
  await handler({ method, body, headers }, response);
  return response;
}

test("registration rejects incomplete input before accessing the database", async () => {
  const response = await call(register, { method: "POST", body: {} });

  assert.equal(response.statusCode, 400);
  assert.match(response.json().error, /correo válido/i);
});

test("login rejects empty credentials", async () => {
  const response = await call(login, { method: "POST", body: {} });

  assert.equal(response.statusCode, 400);
  assert.match(response.json().error, /correo y una contraseña/i);
});

test("authentication routes reject unsupported methods", async () => {
  const response = await call(register, { method: "GET" });

  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.allow, "POST");
  assert.equal(response.headers["cache-control"], "no-store");
});

test("URL-encoded fallback form bodies are parsed without using the URL", () => {
  const body = readJsonBody({
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "email=ana%40example.com&password=12345678",
  });

  assert.deepEqual(body, {
    email: "ana@example.com",
    password: "12345678",
  });
});

test("session lookup without a cookie returns a signed-out user", async () => {
  const response = await call(currentUser);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { user: null });
});

test("session lookup clears an invalid session cookie", async () => {
  const response = await call(currentUser, {
    headers: { cookie: `${SESSION_COOKIE}=invalid-token` },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { user: null });
  assert.match(response.headers["set-cookie"], /Max-Age=0/);
});

test("session lookup rejects tokens signed with a different algorithm", async () => {
  const token = jwt.sign({ sub: "42" }, process.env.JWT_SECRET, {
    algorithm: "HS512",
    expiresIn: "1h",
  });
  const response = await call(currentUser, {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { user: null });
  assert.match(response.headers["set-cookie"], /Max-Age=0/);
});

test("logout expires the HTTP-only session cookie", async () => {
  const response = await call(logout, { method: "POST" });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["set-cookie"], new RegExp(`^${SESSION_COOKIE}=`));
  assert.match(response.headers["set-cookie"], /HttpOnly/);
  assert.match(response.headers["set-cookie"], /SameSite=Lax/);
  assert.match(response.headers["set-cookie"], /Max-Age=0/);
});

test("session tokens expire after seven days and are read from the cookie", () => {
  const token = createSessionToken("42");
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  const request = {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  };

  assert.equal(payload.sub, "42");
  assert.equal(payload.exp - payload.iat, SESSION_DURATION_SECONDS);
  assert.equal(readSessionUserId(request), "42");
});

test("production session cookies use Secure", () => {
  process.env.VERCEL_ENV = "production";
  const response = createResponse();
  setSessionCookie(response, "signed-token");

  assert.match(response.headers["set-cookie"], /; Secure$/);
  assert.match(response.headers["set-cookie"], /HttpOnly/);
  assert.match(response.headers["set-cookie"], /SameSite=Lax/);
  delete process.env.VERCEL_ENV;
});

test("all site pages expose a shared session navigation", async () => {
  const pages = [
    "index.html",
    "proyecto.html",
    "publicar.html",
    "intercambio.html",
    "puntos-acopio.html",
    "educacion.html",
    "login.html",
    "registro.html",
  ];

  for (const page of pages) {
    const markup = await readFile(new URL(page, rootDirectory), "utf8");
    assert.match(markup, /data-auth-nav/, `${page} must show session navigation`);
  }
});

test("auth, publishing, location, and counter hooks match main.js selectors", async () => {
  const [registration, login, publishing, collection, home, education] =
    await Promise.all(
      [
        "registro.html",
        "login.html",
        "publicar.html",
        "puntos-acopio.html",
        "index.html",
        "educacion.html",
      ].map((page) => readFile(new URL(page, rootDirectory), "utf8")),
    );

  assert.match(registration, /data-auth-register/);
  for (const name of ["nombre", "apellidos", "distrito", "email", "password"]) {
    assert.match(registration, new RegExp(`name="${name}"`));
  }
  assert.match(registration, /name="confirm-password"/);

  assert.match(login, /data-auth-login/);
  for (const name of ["email", "password"]) {
    assert.match(login, new RegExp(`name="${name}"`));
  }

  assert.match(publishing, /data-publish-form/);
  assert.match(publishing, /data-publish-result/);
  assert.match(publishing, /data-photo-input/);
  assert.match(publishing, /data-photo-preview/);
  for (const name of ["category", "brand", "age", "description", "condition"]) {
    assert.match(publishing, new RegExp(`name="${name}"`));
  }

  assert.match(collection, /data-use-location/);
  assert.match(collection, /data-location-status/);

  for (const [page, markup] of [
    ["index.html", home],
    ["educacion.html", education],
  ]) {
    assert.match(markup, /data-count-source=/, `${page} needs dynamic counters`);
    const sources = [...markup.matchAll(/data-count-source="([^"]+)"/g)].map(
      ([, source]) => source,
    );
    const countElements = markup.match(/<strong\b[^>]*data-count[^>]*>/g) || [];
    assert.ok(sources.length > 0, `${page} must have at least one counter`);
    assert.equal(
      sources.length,
      countElements.length,
      `${page} must assign a source to every dynamic counter`,
    );
    assert.ok(
      sources.every((source) =>
        ["published", "operational", "collection", "districts"].includes(source),
      ),
      `${page} contains a counter source that main.js does not calculate`,
    );
  }
});

test("login and registration forms no longer use the demonstration handler", async () => {
  for (const [page, selector, action] of [
    ["login.html", "data-auth-login", "/api/login"],
    ["registro.html", "data-auth-register", "/api/registro"],
  ]) {
    const markup = await readFile(new URL(page, rootDirectory), "utf8");
    assert.match(markup, new RegExp(selector));
    assert.match(markup, new RegExp(`action="${action}"`));
    assert.match(markup, /method="post"/);
    assert.doesNotMatch(markup, /demo-form/);
  }
});
