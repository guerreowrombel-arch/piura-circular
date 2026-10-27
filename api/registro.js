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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_COST = 12;

export default async function register(request, response) {
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

  const nombre = typeof data.nombre === "string" ? data.nombre.trim() : "";
  const apellidos =
    typeof data.apellidos === "string" ? data.apellidos.trim() : "";
  const distrito = typeof data.distrito === "string" ? data.distrito.trim() : "";
  const email =
    typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  const password = typeof data.password === "string" ? data.password : "";

  if (
    !nombre ||
    nombre.length > 100 ||
    !apellidos ||
    apellidos.length > 150 ||
    !distrito ||
    distrito.length > 100 ||
    !EMAIL_PATTERN.test(email) ||
    email.length > 254 ||
    password.length < 8 ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    sendJson(response, 400, {
      error:
        "Revisa tus datos: completa nombre, apellidos y distrito, usa un correo válido y una contraseña de 8 a 72 bytes.",
    });
    return;
  }

  try {
    assertJwtSecretConfigured();
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const sql = getDatabase();
    const [user] = await sql`
      INSERT INTO usuarios (nombre, apellidos, distrito, email, password_hash)
      VALUES (${nombre}, ${apellidos}, ${distrito}, ${email}, ${passwordHash})
      RETURNING id, nombre, apellidos, distrito, email
    `;
    const token = createSessionToken(user.id);
    setSessionCookie(response, token);
    sendJson(response, 201, { user: { ...user, id: String(user.id) } });
  } catch (error) {
    if (error?.code === "23505") {
      sendJson(response, 409, { error: "Ya existe una cuenta con ese correo." });
      return;
    }
    console.error("No se pudo registrar la cuenta.", error);
    sendJson(response, 500, {
      error: "No se pudo crear la cuenta. Inténtalo de nuevo más tarde.",
    });
  }
}
