import jwt from "jsonwebtoken";
import { getDatabase } from "../db.js";
import {
  clearSessionCookie,
  methodNotAllowed,
  readJsonBody,
  readSessionUserId,
  sendJson,
} from "../auth.js";

const MAX_BIGINT = 9223372036854775807n;

function readUserId(request, response) {
  try {
    const userId = readSessionUserId(request);
    if (userId) return userId;
    sendJson(response, 401, {
      error: "Inicia sesión para consultar tus publicaciones.",
    });
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

function parsePublicationId(value) {
  const id = typeof value === "string" ? value : String(value ?? "");
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > MAX_BIGINT) return null;
  return id;
}

function readPublicationId(request) {
  const url = new URL(request.url, "http://localhost");
  return parsePublicationId(
    request.query?.id === undefined
      ? url.searchParams.get("id")
      : request.query.id,
  );
}

export default async function myPublications(request, response) {
  if (!["GET", "PUT", "DELETE"].includes(request.method)) {
    methodNotAllowed(response, ["GET", "PUT", "DELETE"]);
    return;
  }

  let userId;
  try {
    userId = readUserId(request, response);
  } catch (error) {
    console.error("No se pudo verificar la sesión de publicaciones personales.", error);
    sendJson(response, 500, { error: "No se pudo verificar la sesión." });
    return;
  }
  if (!userId) return;

  let data;
  if (request.method === "PUT") {
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
    if (!parsePublicationId(data.id) || data.estado !== "entregada") {
      sendJson(response, 400, {
        error: "Indica una publicación válida y el estado entregada.",
      });
      return;
    }
  }

  const publicationId =
    request.method === "DELETE"
      ? readPublicationId(request)
      : request.method === "PUT"
        ? parsePublicationId(data.id)
        : null;
  if (request.method === "DELETE" && !publicationId) {
    sendJson(response, 400, { error: "Indica una publicación válida." });
    return;
  }

  try {
    const sql = getDatabase();
    if (request.method === "GET") {
      const [user] = await sql`
        SELECT id
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
      const rows = await sql`
        SELECT
          id,
          categoria,
          marca,
          condicion,
          estado,
          created_at AS fecha,
          CASE
            WHEN jsonb_typeof(fotos) = 'array' AND jsonb_array_length(fotos) > 0
              THEN fotos ->> 0
            ELSE NULL
          END AS foto
        FROM publicaciones
        WHERE usuario_id = ${userId}
        ORDER BY created_at DESC, id DESC
      `;
      sendJson(response, 200, {
        publicaciones: rows.map((row) => ({
          ...row,
          id: String(row.id),
        })),
      });
      return;
    }

    if (request.method === "PUT") {
      const [updated] = await sql`
        UPDATE publicaciones
        SET estado = 'entregada'
        WHERE id = ${publicationId}
          AND usuario_id = ${userId}
        RETURNING id, estado
      `;
      if (!updated) {
        const [user] = await sql`
          SELECT id
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
        sendJson(response, 403, {
          error: "No tienes permiso para modificar esta publicación.",
        });
        return;
      }
      sendJson(response, 200, {
        publicacion: { ...updated, id: String(updated.id) },
      });
      return;
    }

    const [deleted] = await sql`
      DELETE FROM publicaciones
      WHERE id = ${publicationId}
        AND usuario_id = ${userId}
      RETURNING id
    `;
    if (!deleted) {
      const [user] = await sql`
        SELECT id
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
      sendJson(response, 403, {
        error: "No tienes permiso para eliminar esta publicación.",
      });
      return;
    }
    sendJson(response, 200, { ok: true, id: String(deleted.id) });
  } catch (error) {
    console.error("No se pudieron gestionar las publicaciones personales.", error);
    sendJson(response, 500, {
      error: "No se pudieron gestionar tus publicaciones.",
    });
  }
}
