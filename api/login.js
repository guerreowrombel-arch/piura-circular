import bcrypt from "bcryptjs";
import { getDatabase } from "../db.js";
import {
  assertJwtSecretConfigured,
  createSessionToken,
  methodNotAllowed,
  readJsonBody,
  sendJson,
  setSessionCookie,
} from "../auth.js";

export default async function login(request, response) {
  if (request.method !== "POST") {
    methodNotAllowed(response, ["POST"]);
    return;
  }

  let data;
  try {
    data = readJsonBody(request);
  } catch {
    sendJson(response, 400, { error: "El cuerpo de la solicitud no es JSON válido." });
    return;
  }

  const email =
    typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  const password = typeof data.password === "string" ? data.password : "";
  if (
    !email ||
    email.length > 254 ||
    !password ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    sendJson(response, 400, { error: "Ingresa un correo y una contraseña válidos." });
    return;
  }

  try {
    assertJwtSecretConfigured();
    const sql = getDatabase();
    const [user] = await sql`
      SELECT id, nombre, apellidos, distrito, email, password_hash
      FROM usuarios
      WHERE email = ${email}
      LIMIT 1
    `;
    const passwordMatches =
      user && (await bcrypt.compare(password, user.password_hash));
    if (!passwordMatches) {
      sendJson(response, 401, { error: "Correo o contraseña incorrectos." });
      return;
    }

    const token = createSessionToken(user.id);
    setSessionCookie(response, token);
    const { password_hash: _passwordHash, ...safeUser } = user;
    sendJson(response, 200, {
      user: { ...safeUser, id: String(safeUser.id) },
    });
  } catch (error) {
    console.error("No se pudo iniciar sesión.", error);
    sendJson(response, 500, {
      error: "No se pudo iniciar sesión. Inténtalo de nuevo más tarde.",
    });
  }
}
