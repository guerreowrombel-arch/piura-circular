import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getDatabase } from "../db.js";
import {
  clearSessionCookie,
  methodNotAllowed,
  readJsonBody,
  readSessionUserId,
  sendJson,
} from "../auth.js";

const BCRYPT_COST = 12;

function readUserId(request, response) {
  try {
    const userId = readSessionUserId(request);
    if (userId) return userId;
    sendJson(response, 401, { error: "Inicia sesión para cambiar tu contraseña." });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      clearSessionCookie(response);
      sendJson(response, 401, {
        error: "Tu sesión venció. Inicia sesión nuevamente.",
      });
      return null;
    }
    throw error;
  }
  return null;
}

export default async function changePassword(request, response) {
  if (request.method !== "POST") {
    methodNotAllowed(response, ["POST"]);
    return;
  }

  let userId;
  try {
    userId = readUserId(request, response);
  } catch (error) {
    console.error("No se pudo verificar la sesión para cambiar la contraseña.", error);
    sendJson(response, 500, { error: "No se pudo verificar la sesión." });
    return;
  }
  if (!userId) return;

  let data;
  try {
    data = readJsonBody(request);
  } catch {
    sendJson(response, 400, {
      error: "El cuerpo de la solicitud no es JSON válido.",
    });
    return;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    sendJson(response, 400, {
      error: "El cuerpo de la solicitud debe ser un objeto JSON.",
    });
    return;
  }

  const actual = typeof data.actual === "string" ? data.actual : "";
  const nueva = typeof data.nueva === "string" ? data.nueva : "";
  const nuevaBytes = Buffer.byteLength(nueva, "utf8");
  if (!actual || Buffer.byteLength(actual, "utf8") > 72) {
    sendJson(response, 400, {
      error: "Ingresa la contraseña actual (máximo 72 bytes).",
    });
    return;
  }
  if (nuevaBytes < 8 || nuevaBytes > 72) {
    sendJson(response, 400, {
      error: "La nueva contraseña debe tener entre 8 y 72 bytes.",
    });
    return;
  }
  if (actual === nueva) {
    sendJson(response, 400, {
      error: "La nueva contraseña debe ser distinta de la actual.",
    });
    return;
  }

  try {
    const sql = getDatabase();
    const [user] = await sql`
      SELECT password_hash
      FROM usuarios
      WHERE id = ${userId}
      LIMIT 1
    `;
    if (!user) {
      clearSessionCookie(response);
      sendJson(response, 401, {
        error: "La cuenta de esta sesión ya no existe. Inicia sesión nuevamente.",
      });
      return;
    }
    if (!(await bcrypt.compare(actual, user.password_hash))) {
      sendJson(response, 401, { error: "La contraseña actual es incorrecta." });
      return;
    }
    if (await bcrypt.compare(nueva, user.password_hash)) {
      sendJson(response, 400, {
        error: "La nueva contraseña debe ser distinta de la actual.",
      });
      return;
    }

    const passwordHash = await bcrypt.hash(nueva, BCRYPT_COST);
    const [updated] = await sql`
      UPDATE usuarios
      SET password_hash = ${passwordHash}
      WHERE id = ${userId}
      RETURNING id
    `;
    if (!updated) {
      clearSessionCookie(response);
      sendJson(response, 401, {
        error: "La cuenta de esta sesión ya no existe. Inicia sesión nuevamente.",
      });
      return;
    }
    sendJson(response, 200, { ok: true });
  } catch (error) {
    console.error("No se pudo cambiar la contraseña.", error);
    sendJson(response, 500, {
      error: "No se pudo cambiar la contraseña. Inténtalo más tarde.",
    });
  }
}
