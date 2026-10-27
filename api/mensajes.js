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
    sendJson(response, 401, { error: "Inicia sesión para acceder a los mensajes." });
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

function getConversationId(value) {
  const id = typeof value === "string" ? value : String(value ?? "");
  return /^[1-9]\d{0,18}$/.test(id) ? id : null;
}

async function findParticipatingConversation(sql, conversationId, userId) {
  const [conversation] = await sql`
    SELECT id
    FROM conversaciones
    WHERE id = ${conversationId}
      AND (interesado_id = ${userId} OR dueno_id = ${userId})
    LIMIT 1
  `;
  return conversation || null;
}

export default async function messages(request, response) {
  let userId;
  try {
    userId = getUserId(request, response);
  } catch (error) {
    console.error("No se pudo verificar la sesión de mensajes.", error);
    sendJson(response, 500, { error: "No se pudo verificar la sesión." });
    return;
  }
  if (!userId) return;

  const requestUrl = new URL(request.url, "http://localhost");
  if (request.method === "GET") {
    const conversationId = getConversationId(
      requestUrl.searchParams.get("conversacion"),
    );
    if (!conversationId) {
      sendJson(response, 400, { error: "Indica una conversación válida." });
      return;
    }

    try {
      const sql = getDatabase();
      const conversation = await findParticipatingConversation(
        sql,
        conversationId,
        userId,
      );
      if (!conversation) {
        sendJson(response, 403, {
          error: "No tienes permiso para leer esta conversación.",
        });
        return;
      }

      const rows = await sql`
        SELECT
          m.id,
          m.autor_id AS "authorId",
          m.texto AS text,
          m.created_at AS "createdAt",
          u.nombre AS "authorName",
          LEFT(BTRIM(u.apellidos), 1) AS "authorInitial"
        FROM mensajes m
        INNER JOIN usuarios u ON u.id = m.autor_id
        WHERE m.conversacion_id = ${conversationId}
        ORDER BY m.created_at ASC, m.id ASC
      `;
      sendJson(response, 200, {
        messages: rows.map((row) => ({
          ...row,
          id: String(row.id),
          authorId: String(row.authorId),
        })),
      });
    } catch (error) {
      console.error("No se pudieron cargar los mensajes.", error);
      sendJson(response, 500, { error: "No se pudieron cargar los mensajes." });
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

  const conversationId = getConversationId(data.conversacionId);
  const text = typeof data.texto === "string" ? data.texto.trim() : "";
  if (!conversationId) {
    sendJson(response, 400, { error: "Indica una conversación válida." });
    return;
  }
  if (!text || text.length > 1000) {
    sendJson(response, 400, {
      error: "El mensaje debe tener entre 1 y 1000 caracteres.",
    });
    return;
  }

  try {
    const sql = getDatabase();
    const conversation = await findParticipatingConversation(
      sql,
      conversationId,
      userId,
    );
    if (!conversation) {
      sendJson(response, 403, {
        error: "No tienes permiso para enviar mensajes en esta conversación.",
      });
      return;
    }

    const [message] = await sql`
      INSERT INTO mensajes (conversacion_id, autor_id, texto)
      VALUES (${conversationId}, ${userId}, ${text})
      RETURNING id, conversacion_id AS "conversationId", autor_id AS "authorId",
        texto AS text, created_at AS "createdAt"
    `;
    sendJson(response, 201, {
      message: {
        ...message,
        id: String(message.id),
        conversationId: String(message.conversationId),
        authorId: String(message.authorId),
      },
    });
  } catch (error) {
    console.error("No se pudo guardar el mensaje.", error);
    sendJson(response, 500, { error: "No se pudo guardar el mensaje." });
  }
}
