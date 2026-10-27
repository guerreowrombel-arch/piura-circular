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

function readInterestedPublicationId(request) {
  const url = new URL(request.url, "http://localhost");
  if (
    request.query &&
    Object.prototype.hasOwnProperty.call(request.query, "interesados")
  ) {
    return parsePublicationId(request.query.interesados);
  }
  if (url.searchParams.has("interesados")) {
    return parsePublicationId(url.searchParams.get("interesados"));
  }
  return undefined;
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
    if (
      !parsePublicationId(data.id) ||
      data.estado !== "entregada" ||
      (data.entregadaA !== undefined && !parsePublicationId(data.entregadaA))
    ) {
      sendJson(response, 400, {
        error:
          "Indica una publicación válida, el estado entregada y un destinatario válido si corresponde.",
      });
      return;
    }
  }

  const interestedPublicationId =
    request.method === "GET" ? readInterestedPublicationId(request) : undefined;
  if (request.method === "GET" && interestedPublicationId === null) {
    sendJson(response, 400, {
      error: "Indica una publicación válida para consultar interesados.",
    });
    return;
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
      if (interestedPublicationId !== undefined) {
        const [ownedPublication] = await sql`
          SELECT id
          FROM publicaciones
          WHERE id = ${interestedPublicationId}
            AND usuario_id = ${userId}
          LIMIT 1
        `;
        if (!ownedPublication) {
          sendJson(response, 403, {
            error: "No tienes permiso para consultar los interesados de esta publicación.",
          });
          return;
        }
        const interestedUsers = await sql`
          SELECT DISTINCT
            u.id,
            CONCAT_WS(' ', u.nombre, NULLIF(BTRIM(u.apellidos), '')) AS nombre
          FROM conversaciones c
          INNER JOIN usuarios u ON u.id = c.interesado_id
          WHERE c.publicacion_id = ${interestedPublicationId}
            AND c.dueno_id = ${userId}
          ORDER BY nombre ASC, u.id ASC
        `;
        sendJson(response, 200, {
          interesados: interestedUsers.map((interested) => ({
            id: String(interested.id),
            nombre: interested.nombre,
          })),
        });
        return;
      }

      const rows = await sql`
        SELECT
          p.id,
          p.categoria,
          p.marca,
          p.condicion,
          p.estado,
          p.created_at AS fecha,
          u.nombre AS "entregadaA",
          CASE
            WHEN jsonb_typeof(p.fotos) = 'array' AND jsonb_array_length(p.fotos) > 0
              THEN p.fotos ->> 0
            ELSE NULL
          END AS foto
        FROM publicaciones p
        LEFT JOIN usuarios u ON u.id = p.entregada_a
        WHERE p.usuario_id = ${userId}
        ORDER BY p.created_at DESC, p.id DESC
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
      if (data.entregadaA !== undefined) {
        const [conversation] = await sql`
          SELECT c.interesado_id
          FROM conversaciones c
          INNER JOIN publicaciones p ON p.id = c.publicacion_id
          WHERE c.publicacion_id = ${publicationId}
            AND c.interesado_id = ${data.entregadaA}
            AND p.usuario_id = ${userId}
          LIMIT 1
        `;
        if (!conversation) {
          const [user] = await sql`
            SELECT id
            FROM usuarios
            WHERE id = ${userId}
            LIMIT 1
          `;
          if (!user) {
            clearSessionCookie(response);
            sendJson(response, 401, {
              error:
                "La cuenta de esta sesión ya no existe. Inicia sesión nuevamente.",
            });
            return;
          }
          const [ownedPublication] = await sql`
            SELECT id
            FROM publicaciones
            WHERE id = ${publicationId}
              AND usuario_id = ${userId}
            LIMIT 1
          `;
          if (!ownedPublication) {
            sendJson(response, 403, {
              error: "No tienes permiso para modificar esta publicación.",
            });
            return;
          }
          sendJson(response, 400, {
            error:
              "El destinatario debe haber conversado sobre esta publicación.",
          });
          return;
        }
      }
      const [updated] = await sql`
        UPDATE publicaciones
        SET
          estado = 'entregada',
          entregada_a = ${data.entregadaA ?? null}
        WHERE id = ${publicationId}
          AND usuario_id = ${userId}
          AND estado = 'activa'
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
        const [ownedPublication] = await sql`
          SELECT estado
          FROM publicaciones
          WHERE id = ${publicationId}
            AND usuario_id = ${userId}
          LIMIT 1
        `;
        if (ownedPublication?.estado === "entregada") {
          sendJson(response, 409, {
            error: "Esta publicación ya fue marcada como entregada.",
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
