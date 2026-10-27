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

function readUserId(request, response) {
  try {
    const userId = readSessionUserId(request);
    if (userId) return userId;
    sendJson(response, 401, { error: "Inicia sesión para acceder a tu perfil." });
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

function readBody(request, response) {
  let data;
  try {
    data = readJsonBody(request);
  } catch {
    sendJson(response, 400, {
      error: "El cuerpo de la solicitud no es JSON válido.",
    });
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    sendJson(response, 400, {
      error: "El cuerpo de la solicitud debe ser un objeto JSON.",
    });
    return null;
  }
  return data;
}

function validateProfile(data) {
  const nombre = typeof data.nombre === "string" ? data.nombre.trim() : "";
  const apellidos =
    typeof data.apellidos === "string" ? data.apellidos.trim() : "";
  const distrito = typeof data.distrito === "string" ? data.distrito.trim() : "";
  if (
    !nombre ||
    nombre.length > 100 ||
    !apellidos ||
    apellidos.length > 150 ||
    !distrito ||
    distrito.length > 100
  ) {
    return {
      error:
        "Completa nombre, apellidos y distrito (máximo 100, 150 y 100 caracteres, respectivamente).",
    };
  }
  return { profile: { nombre, apellidos, distrito } };
}

export default async function profile(request, response) {
  if (!["GET", "PUT", "DELETE"].includes(request.method)) {
    methodNotAllowed(response, ["GET", "PUT", "DELETE"]);
    return;
  }

  let userId;
  try {
    userId = readUserId(request, response);
  } catch (error) {
    console.error("No se pudo verificar la sesión del perfil.", error);
    sendJson(response, 500, { error: "No se pudo verificar la sesión." });
    return;
  }
  if (!userId) return;

  let data;
  if (request.method !== "GET") {
    data = readBody(request, response);
    if (!data) return;
  }

  if (request.method === "PUT") {
    const validation = validateProfile(data);
    if (validation.error) {
      sendJson(response, 400, { error: validation.error });
      return;
    }
  }
  try {
    const sql = getDatabase();
    if (request.method === "GET") {
      const [user] = await sql`
        SELECT nombre, apellidos, distrito, email, rol
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

      const [impact] = await sql`
        SELECT
          COUNT(*)::int AS publicadas,
          COUNT(*) FILTER (
            WHERE estado = 'entregada'
              AND condicion IN ('Operativo', 'Requiere reparación')
          )::int AS reutilizadas,
          COUNT(*) FILTER (
            WHERE estado = 'entregada'
              AND condicion = 'No reutilizable'
          )::int AS "derivadasAcopio"
        FROM publicaciones
        WHERE usuario_id = ${userId}
      `;
      let entidad = null;
      if (user.rol === "entidad") {
        const [entity] = await sql`
          SELECT nombre, plan
          FROM entidades
          WHERE usuario_id = ${userId}
          LIMIT 1
        `;
        if (entity) entidad = { nombre: entity.nombre, plan: entity.plan };
      }
      sendJson(response, 200, {
        perfil: {
          nombre: user.nombre,
          apellidos: user.apellidos,
          distrito: user.distrito,
          email: user.email,
          rol: user.rol,
          ...(user.rol === "entidad" ? { entidad } : {}),
        },
        impacto: {
          publicadas: Number(impact?.publicadas || 0),
          reutilizadas: Number(impact?.reutilizadas || 0),
          derivadasAcopio: Number(impact?.derivadasAcopio || 0),
        },
      });
      return;
    }

    if (request.method === "PUT") {
      const { profile: updatedProfile } = validateProfile(data);
      const [updated] = await sql`
        UPDATE usuarios
        SET
          nombre = ${updatedProfile.nombre},
          apellidos = ${updatedProfile.apellidos},
          distrito = ${updatedProfile.distrito}
        WHERE id = ${userId}
        RETURNING nombre, apellidos, distrito
      `;
      if (!updated) {
        clearSessionCookie(response);
        sendJson(response, 401, {
          error: "La cuenta de esta sesión ya no existe. Inicia sesión nuevamente.",
        });
        return;
      }
      sendJson(response, 200, { perfil: updated });
      return;
    }

    const [user] = await sql`
      SELECT rol, password_hash
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
    if (user.rol === "entidad") {
      sendJson(response, 403, {
        error: "Las cuentas de entidad no se eliminan desde el perfil.",
      });
      return;
    }
    if (
      typeof data.password !== "string" ||
      !data.password ||
      Buffer.byteLength(data.password, "utf8") > 72
    ) {
      sendJson(response, 400, {
        error: "Ingresa la contraseña de tu cuenta (máximo 72 bytes).",
      });
      return;
    }
    if (!(await bcrypt.compare(data.password, user.password_hash))) {
      sendJson(response, 401, { error: "La contraseña es incorrecta." });
      return;
    }

    const [deleted] = await sql`
      DELETE FROM usuarios
      WHERE id = ${userId}
        AND rol <> 'entidad'
      RETURNING id
    `;
    if (!deleted) {
      sendJson(response, 403, {
        error: "Las cuentas de entidad no se eliminan desde el perfil.",
      });
      return;
    }
    clearSessionCookie(response);
    sendJson(response, 200, { ok: true });
  } catch (error) {
    console.error("No se pudo procesar la solicitud del perfil.", error);
    sendJson(response, 500, {
      error: "No se pudo completar la solicitud del perfil.",
    });
  }
}
