import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFile } from "node:fs/promises";
import jwt from "jsonwebtoken";
import register from "../api/registro.js";
import login from "../api/login.js";
import logout from "../api/logout.js";
import currentUser from "../api/me.js";
import publications from "../api/publicaciones.js";
import conversations from "../api/conversaciones.js";
import messages from "../api/mensajes.js";
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

async function call(
  handler,
  { method = "GET", body, headers = {}, url = "/" } = {},
) {
  const response = createResponse();
  await handler({ method, body, headers, url }, response);
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

test("publications require a valid session for POST", async () => {
  const response = await call(publications, {
    method: "POST",
    body: {},
  });

  assert.equal(response.statusCode, 401);
  assert.match(response.json().error, /Inicia sesión/);
});

test("conversation and message APIs require a session", async () => {
  const conversationResponse = await call(conversations, {
    method: "POST",
    body: {},
  });
  const messageResponse = await call(messages, {
    method: "POST",
    body: {},
  });

  assert.equal(conversationResponse.statusCode, 401);
  assert.equal(messageResponse.statusCode, 401);
  assert.match(conversationResponse.json().error, /Inicia sesión/);
  assert.match(messageResponse.json().error, /Inicia sesión/);
});

test("conversation API rejects unsupported methods and invalid publication IDs", async () => {
  const token = createSessionToken("42");
  const headers = { cookie: `${SESSION_COOKIE}=${token}` };
  const unsupported = await call(conversations, {
    method: "DELETE",
    headers,
  });
  const invalidPublication = await call(conversations, {
    method: "POST",
    headers,
    body: { publicacionId: "invalid" },
  });

  assert.equal(unsupported.statusCode, 405);
  assert.equal(unsupported.headers.allow, "GET, POST");
  assert.equal(invalidPublication.statusCode, 400);
  assert.match(invalidPublication.json().error, /publicación válida/i);
});

test("messages API validates conversation IDs and message length before database access", async () => {
  const token = createSessionToken("42");
  const headers = { cookie: `${SESSION_COOKIE}=${token}` };
  const invalidConversation = await call(messages, {
    method: "GET",
    headers,
    url: "/api/mensajes?conversacion=invalid",
  });
  const emptyMessage = await call(messages, {
    method: "POST",
    headers,
    body: { conversacionId: "12", texto: "   " },
  });
  const oversizedMessage = await call(messages, {
    method: "POST",
    headers,
    body: { conversacionId: "12", texto: "x".repeat(1001) },
  });

  assert.equal(invalidConversation.statusCode, 400);
  assert.match(invalidConversation.json().error, /conversación válida/i);
  assert.equal(emptyMessage.statusCode, 400);
  assert.equal(oversizedMessage.statusCode, 400);
  assert.match(emptyMessage.json().error, /1 y 1000 caracteres/);
});

test("message summary endpoint also requires a session", async () => {
  const response = await call(messages, {
    method: "GET",
    url: "/api/mensajes?resumen=1",
  });

  assert.equal(response.statusCode, 401);
});

test("publications reject non-object JSON bodies", async () => {
  const token = createSessionToken("42");
  const response = await call(publications, {
    method: "POST",
    headers: {
      cookie: `${SESSION_COOKIE}=${token}`,
      "content-type": "application/json",
    },
    body: "null",
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.json().error, /objeto JSON/);
});

test("publications reject invalid category before accessing the database", async () => {
  const token = createSessionToken("42");
  const response = await call(publications, {
    method: "POST",
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
    body: {
      category: "Categoría desconocida",
      description: "Equipo de prueba",
      condition: "Operativo",
      photos: [],
    },
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.json().error, /categoría válida/i);
});

test("publications validate description length, condition, and photo count", async () => {
  const token = createSessionToken("42");
  const cookie = `${SESSION_COOKIE}=${token}`;
  const validBase = {
    category: "Computadoras",
    description: "Equipo de prueba",
    condition: "Operativo",
    photos: [],
  };
  const tooLongDescription = await call(publications, {
    method: "POST",
    headers: { cookie },
    body: { ...validBase, description: "x".repeat(1001) },
  });
  assert.equal(tooLongDescription.statusCode, 400);
  assert.match(tooLongDescription.json().error, /1000 caracteres/);

  const invalidCondition = await call(publications, {
    method: "POST",
    headers: { cookie },
    body: { ...validBase, condition: "Dudoso" },
  });
  assert.equal(invalidCondition.statusCode, 400);
  assert.match(invalidCondition.json().error, /condición válida/);

  const invalidPhotoCount = await call(publications, {
    method: "POST",
    headers: { cookie },
    body: {
      ...validBase,
      photos: [
        "data:image/jpeg;base64,YQ==",
        "data:image/jpeg;base64,Yg==",
        "data:image/jpeg;base64,Yw==",
        "data:image/jpeg;base64,ZA==",
      ],
    },
  });
  assert.equal(invalidPhotoCount.statusCode, 400);
  assert.match(invalidPhotoCount.json().error, /máximo 3 fotos/);
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
    "mensajes.html",
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

test("publications are sent to the API and rendered without local publication storage", async () => {
  const mainScript = await readFile(
    new URL("js/main.js", rootDirectory),
    "utf8",
  );
  const endpoint = await readFile(
    new URL("api/publicaciones.js", rootDirectory),
    "utf8",
  );
  const schema = await readFile(
    new URL("schema.sql", rootDirectory),
    "utf8",
  );

  assert.match(mainScript, /fetch\("\/api\/publicaciones\?summary=1"/);
  assert.match(mainScript, /fetch\("\/api\/publicaciones"/);
  assert.match(mainScript, /createImageBitmap\(file\)/);
  assert.match(mainScript, /800 \/ Math\.max\(bitmap\.width, bitmap\.height\)/);
  assert.match(mainScript, /"image\/jpeg",\s*0\.7/);
  assert.match(mainScript, /response\.status === 401/);
  assert.doesNotMatch(mainScript, /localStorage\.(?:getItem|setItem)\(["']publicaciones/);
  assert.doesNotMatch(mainScript, /\.innerHTML\s*=/);
  assert.match(endpoint, /LEFT\(BTRIM\(u\.apellidos\), 1\)/);
  assert.match(endpoint, /u\.distrito\s+AS district/);
  assert.doesNotMatch(endpoint, /u\.email/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS publicaciones/);
  assert.match(schema, /REFERENCES usuarios\(id\)/);
});

test("messaging schema, API routes, and interface use the required contracts", async () => {
  const [schema, conversationApi, messageApi, page, mainScript, exchangePage] =
    await Promise.all([
      "schema.sql",
      "api/conversaciones.js",
      "api/mensajes.js",
      "mensajes.html",
      "js/main.js",
      "intercambio.html",
    ].map((file) => readFile(new URL(file, rootDirectory), "utf8")));

  assert.match(
    schema,
    /CREATE TABLE IF NOT EXISTS conversaciones\s*\(\s*id[\s\S]*?publicacion_id[\s\S]*?interesado_id[\s\S]*?dueno_id[\s\S]*?created_at/s,
  );
  assert.match(
    schema,
    /CREATE TABLE IF NOT EXISTS mensajes\s*\(\s*id[\s\S]*?conversacion_id[\s\S]*?autor_id[\s\S]*?texto[\s\S]*?created_at/s,
  );
  assert.match(schema, /leido BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(schema, /ADD COLUMN IF NOT EXISTS leido BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(conversationApi, /c\.interesado_id = \$\{userId\} OR c\.dueno_id = \$\{userId\}/);
  assert.match(conversationApi, /ON CONFLICT \(publicacion_id, interesado_id\)/);
  assert.match(conversationApi, /"unreadCount"/);
  assert.match(conversationApi, /Hola, me interesa tu \$\{publication\.category\}/);
  assert.match(conversationApi, /INSERT INTO mensajes \(conversacion_id, autor_id, texto\)/);
  assert.doesNotMatch(conversationApi, /other_user\.email|SELECT[^`]*email/s);
  assert.match(messageApi, /interesado_id = \$\{userId\} OR dueno_id = \$\{userId\}/);
  assert.match(messageApi, /ORDER BY m\.created_at ASC, m\.id ASC/);
  assert.match(messageApi, /searchParams\.get\("resumen"\) === "1"/);
  assert.match(messageApi, /m\.leido = FALSE/);
  assert.match(messageApi, /SET leido = TRUE/);

  for (const selector of [
    "data-conversation-list",
    "data-message-list",
    "data-message-form",
    "data-message-status",
    "data-chat-title",
    "data-chat-counterpart",
    "data-meeting-toggle",
    "data-meeting-picker",
    "data-meeting-point-list",
  ]) {
    assert.ok(page.includes(selector), `mensajes.html needs ${selector}`);
    assert.ok(mainScript.includes(selector), `main.js must use ${selector}`);
  }
  assert.match(mainScript, /setInterval\([\s\S]*?5000\)/);
  assert.match(mainScript, /setInterval\([\s\S]*?15000\)/);
  assert.match(mainScript, /document\.visibilityState !== "visible"/);
  assert.match(mainScript, /dataset\.unreadBadge/);
  assert.match(mainScript, /aria-expanded/);
  assert.match(mainScript, /event\.key !== "Escape"/);
  assert.match(mainScript, /9\+/);
  assert.match(mainScript, /data-profile-toggle/);
  assert.match(mainScript, /unreadCount/);
  assert.match(mainScript, /data-conversation-start/);
  assert.match(mainScript, /mensajes\.html\?c=/);
  assert.match(mainScript, /assets\/data\/raee-points\.json/);
  assert.match(mainScript, /point\.name[\s\S]*?point\.address/);
  assert.doesNotMatch(mainScript, /\.innerHTML\s*=/);
  assert.match(exchangePage, /data-example-publication/);
  assert.match(exchangePage, /data-contact=/);
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
