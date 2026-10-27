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
      error: "Inicia sesión para consultar o enviar calificaciones.",
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

function parseId(value) {
  const id = typeof value === "string" ? value : String(value ?? "");
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > MAX_BIGINT) return null;
  return id;
}

function readPendingQuery(request) {
  if (request.query && Object.hasOwn(request.query, "pendientes")) {
    return request.query.pendientes;
  }
  return new URL(request.url, "http://localhost").searchParams.get("pendientes");
}

export default async function ratings(request, response) {
  if (!["GET", "POST"].includes(request.method)) {
    methodNotAllowed(response, ["GET", "POST"]);
    return;
  }

  let userId;
  try {
    userId = readUserId(request, response);
  } catch (error) {
    console.error("No se pudo verificar la sesión de calificaciones.", error);
    sendJson(response, 500, { error: "No se pudo verificar la sesión." });
    return;
  }
  if (!userId) return;

  let data;
  if (request.method === "POST") {
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

    const comment = data.comentario === undefined ? "" : data.comentario;
    if (
      !parseId(data.publicacionId) ||
      !Number.isInteger(data.estrellas) ||
      data.estrellas < 1 ||
      data.estrellas > 5 ||
      typeof comment !== "string" ||
      comment.length > 300
    ) {
      sendJson(response, 400, {
        error:
          "Indica una publicación válida, de 1 a 5 estrellas y un comentario de hasta 300 caracteres.",
      });
      return;
    }
    data.comentario = comment.trim();
  } else if (readPendingQuery(request) !== "1") {
    sendJson(response, 400, {
      error: "Usa ?pendientes=1 para consultar las calificaciones pendientes.",
    });
    return;
  }

  try {
    const sql = getDatabase();
    if (request.method === "GET") {
      const pending = await sql`
        SELECT
          p.id AS "publicacionId",
          CONCAT_WS(' ', p.categoria, NULLIF(BTRIM(p.marca), '')) AS titulo,
          CASE
            WHEN p.usuario_id = ${userId} THEN receptor.nombre
            ELSE dueno.nombre
          END AS "otraPersona"
        FROM publicaciones p
        LEFT JOIN usuarios receptor ON receptor.id = p.entregada_a
        INNER JOIN usuarios dueno ON dueno.id = p.usuario_id
        WHERE p.estado = 'entregada'
          AND p.entregada_a IS NOT NULL
          AND (${userId} = p.usuario_id OR ${userId} = p.entregada_a)
          AND NOT EXISTS (
            SELECT 1
            FROM calificaciones c
            WHERE c.publicacion_id = p.id
              AND c.autor_id = ${userId}
          )
        ORDER BY p.created_at DESC, p.id DESC
      `;
      sendJson(response, 200, {
        pendientes: pending.map((row) => ({
          publicacionId: String(row.publicacionId),
          titulo: row.titulo,
          otraPersona: row.otraPersona,
        })),
      });
      return;
    }

    const publicationId = parseId(data.publicacionId);
    const [publication] = await sql`
      SELECT id, usuario_id, entregada_a, estado
      FROM publicaciones
      WHERE id = ${publicationId}
      LIMIT 1
    `;
    if (!publication) {
      sendJson(response, 404, { error: "No se encontró la publicación." });
      return;
    }
    if (publication.estado !== "entregada" || !publication.entregada_a) {
      sendJson(response, 400, {
        error: "Solo puedes calificar una entrega con destinatario registrado.",
      });
      return;
    }

    const ownerId = String(publication.usuario_id);
    const receiverId = String(publication.entregada_a);
    const currentUserId = String(userId);
    if (currentUserId !== ownerId && currentUserId !== receiverId) {
      sendJson(response, 403, {
        error: "Solo quienes participaron en la entrega pueden calificar.",
      });
      return;
    }
    const recipientId = currentUserId === ownerId ? receiverId : ownerId;
    const [rating] = await sql`
      INSERT INTO calificaciones (
        publicacion_id,
        autor_id,
        destinatario_id,
        estrellas,
        comentario
      )
      VALUES (
        ${publicationId},
        ${userId},
        ${recipientId},
        ${data.estrellas},
        ${data.comentario}
      )
      ON CONFLICT (publicacion_id, autor_id) DO NOTHING
      RETURNING id
    `;
    if (!rating) {
      sendJson(response, 409, {
        error: "Ya calificaste esta publicación.",
      });
      return;
    }
    sendJson(response, 201, { ok: true });
  } catch (error) {
    console.error("No se pudo procesar la calificación.", error);
    sendJson(response, 500, {
      error: "No se pudo completar la calificación. Inténtalo más tarde.",
    });
  }
}
