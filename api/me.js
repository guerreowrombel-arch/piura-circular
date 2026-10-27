import { getDatabase } from "../db.js";
import {
  clearSessionCookie,
  methodNotAllowed,
  readSessionUserId,
  sendJson,
} from "../auth.js";
import jwt from "jsonwebtoken";

export default async function currentUser(request, response) {
  if (request.method !== "GET") {
    methodNotAllowed(response, ["GET"]);
    return;
  }

  let userId;
  try {
    userId = readSessionUserId(request);
  } catch (error) {
    if (
      error instanceof jwt.JsonWebTokenError ||
      error instanceof jwt.TokenExpiredError
    ) {
      clearSessionCookie(response);
      sendJson(response, 200, { user: null });
      return;
    }
    console.error("No se pudo verificar la sesión.", error);
    sendJson(response, 500, { error: "No se pudo verificar la sesión." });
    return;
  }

  if (!userId) {
    sendJson(response, 200, { user: null });
    return;
  }

  try {
    const sql = getDatabase();
    const [user] = await sql`
      SELECT id, nombre, apellidos, distrito, email, rol
      FROM usuarios
      WHERE id = ${userId}
      LIMIT 1
    `;
    if (!user) {
      clearSessionCookie(response);
      sendJson(response, 200, { user: null });
      return;
    }
    let entity = null;
    if (user.rol === "entidad") {
      const [entityRecord] = await sql`
        SELECT nombre, plan
        FROM entidades
        WHERE usuario_id = ${userId}
        LIMIT 1
      `;
      if (entityRecord) {
        entity = { nombre: entityRecord.nombre, plan: entityRecord.plan };
      }
    }
    sendJson(response, 200, {
      user: {
        ...user,
        id: String(user.id),
        rol: user.rol || "ciudadano",
        ...(entity ? { entidad: entity } : {}),
      },
    });
  } catch (error) {
    console.error("No se pudo cargar el perfil de la sesión.", error);
    sendJson(response, 500, {
      error: "No se pudo comprobar la sesión. Inténtalo de nuevo.",
    });
  }
}
