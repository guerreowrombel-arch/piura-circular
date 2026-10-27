import jwt from "jsonwebtoken";
import { getDatabase } from "../db.js";
import {
  clearSessionCookie,
  methodNotAllowed,
  readJsonBody,
  readSessionUserId,
  sendJson,
} from "../auth.js";

function getUserId(request, response) {
  try {
    const userId = readSessionUserId(request);
    if (userId) return userId;
    sendJson(response, 401, { error: "Inicia sesión para ver tus mensajes." });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      clearSessionCookie(response);
      sendJson(response, 401, { error: "Tu sesión venció. Inicia sesión nuevamente." });
      return null;
    }
    throw error;
  }
  return null;
}

function readConversationId(value) {
  const id = typeof value === "string" ? value : String(value ?? "");
  return /^[1-9]\d{0,18}$/.test(id) ? id : null;
}

export default async function conversations(request, response) {
  let userId;
  try {
    userId = getUserId(request, response);
  } catch (error) {
    console.error("No se pudo verificar la sesión de conversaciones.", error);
    sendJson(response, 500, { error: "No se pudo verificar la sesión." });
    return;
  }
  if (!userId) return;

  if (request.method === "GET") {
    try {
      const sql = getDatabase();
      const rows = await sql`
        SELECT
          c.id,
          c.publicacion_id AS "publicationId",
          p.categoria AS category,
          p.marca AS brand,
          other_user.nombre AS "otherName",
          LEFT(BTRIM(other_user.apellidos), 1) AS "otherInitial",
          latest.texto AS "lastMessage",
          latest.created_at AS "lastMessageAt",
          c.created_at AS "createdAt",
          (
            SELECT COUNT(*)
            FROM mensajes unread
            WHERE unread.conversacion_id = c.id
              AND unread.autor_id <> ${userId}
              AND unread.leido = FALSE
          ) AS "unreadCount"
        FROM conversaciones c
        INNER JOIN publicaciones p ON p.id = c.publicacion_id
        INNER JOIN usuarios other_user
          ON other_user.id = CASE
            WHEN c.interesado_id = ${userId} THEN c.dueno_id
            ELSE c.interesado_id
          END
        LEFT JOIN LATERAL (
          SELECT m.texto, m.created_at
          FROM mensajes m
          WHERE m.conversacion_id = c.id
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT 1
        ) latest ON TRUE
        WHERE c.interesado_id = ${userId} OR c.dueno_id = ${userId}
        ORDER BY COALESCE(latest.created_at, c.created_at) DESC, c.id DESC
      `;
      sendJson(response, 200, {
        conversations: rows.map((row) => ({
          ...row,
          id: String(row.id),
          publicationId: String(row.publicationId),
        })),
      });
    } catch (error) {
      console.error("No se pudieron cargar las conversaciones.", error);
      sendJson(response, 500, {
        error: "No se pudieron cargar tus conversaciones.",
      });
    }
    return;
  }

  if (request.method !== "POST") {
    methodNotAllowed(response, ["GET", "POST"]);
    return;
  }

  let data;
  try {
    data = readJsonBody(request);
  } catch {
    sendJson(response, 400, { error: "El cuerpo de la solicitud no es JSON válido." });
    return;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    sendJson(response, 400, { error: "El cuerpo de la solicitud debe ser un objeto JSON." });
    return;
  }

  const publicationId = readConversationId(data.publicacionId);
  if (!publicationId) {
    sendJson(response, 400, { error: "Indica una publicación válida." });
    return;
  }

  try {
    const sql = getDatabase();
    const [publication] = await sql`
      SELECT usuario_id AS "ownerId", categoria AS category, marca AS brand
      FROM publicaciones
      WHERE id = ${publicationId}
      LIMIT 1
    `;
    if (!publication) {
      sendJson(response, 404, { error: "No se encontró esa publicación." });
      return;
    }
    if (String(publication.ownerId) === userId) {
      sendJson(response, 400, {
        error: "No puedes iniciar una conversación con tu propia publicación.",
      });
      return;
    }

    const brand = String(publication.brand || "").trim();
    const greeting = `Hola, me interesa tu ${publication.category}${
      brand ? ` ${brand}` : ""
    }`;
    let [conversation] = await sql`
      WITH created AS (
        INSERT INTO conversaciones (publicacion_id, interesado_id, dueno_id)
        VALUES (${publicationId}, ${userId}, ${publication.ownerId})
        ON CONFLICT (publicacion_id, interesado_id)
        DO NOTHING
        RETURNING id
      ),
      first_message AS (
        INSERT INTO mensajes (conversacion_id, autor_id, texto)
        SELECT created.id, ${userId}, ${greeting}
        FROM created
        RETURNING id
      )
      SELECT created.id
      FROM created
      LEFT JOIN first_message ON TRUE
    `;
    if (!conversation) {
      [conversation] = await sql`
        SELECT id
        FROM conversaciones
        WHERE publicacion_id = ${publicationId}
          AND interesado_id = ${userId}
        LIMIT 1
      `;
    }
    if (!conversation) {
      throw new Error("No se pudo recuperar la conversación creada.");
    }
    sendJson(response, 200, { id: String(conversation.id) });
  } catch (error) {
    console.error("No se pudo abrir la conversación.", error);
    sendJson(response, 500, { error: "No se pudo abrir la conversación." });
  }
}
