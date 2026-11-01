import jwt from "jsonwebtoken";
import { getDatabase } from "../db.js";
import {
  clearSessionCookie,
  methodNotAllowed,
  readJsonBody,
  readSessionUserId,
  sendJson,
} from "../auth.js";

export const COMISION_PCT = 5;

const MAX_BIGINT = 9223372036854775807n;
const ACTIONS = new Set(["pagar", "entregar", "confirmar", "cancelar"]);

function readUserId(request, response) {
  try {
    const userId = readSessionUserId(request);
    if (userId) return userId;
    sendJson(response, 401, {
      error: "Inicia sesión para consultar o gestionar tus compras.",
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

export default async function transactions(request, response) {
  if (!["GET", "POST", "PUT"].includes(request.method)) {
    methodNotAllowed(response, ["GET", "POST", "PUT"]);
    return;
  }

  let userId;
  try {
    userId = readUserId(request, response);
  } catch (error) {
    console.error("No se pudo verificar la sesión de transacciones.", error);
    sendJson(response, 500, { error: "No se pudo verificar la sesión." });
    return;
  }
  if (!userId) return;

  const data = request.method === "GET" ? null : readBody(request, response);
  if (request.method !== "GET" && !data) return;

  if (request.method === "POST" && !parseId(data.publicacionId)) {
    sendJson(response, 400, { error: "Indica una publicación válida." });
    return;
  }
  if (request.method === "PUT" && !parseId(data.id)) {
    sendJson(response, 400, { error: "Indica una transacción válida." });
    return;
  }

  try {
    const sql = getDatabase();
    if (request.method === "GET") {
      const rows = await sql`
        SELECT
          t.id,
          CONCAT_WS(' ', p.categoria, NULLIF(BTRIM(p.marca), '')) AS titulo,
          CASE
            WHEN t.comprador_id = ${userId} THEN vendedor.nombre
            ELSE comprador.nombre
          END AS "otraPersona",
          t.precio,
          t.comision,
          t.neto_vendedor AS "netoVendedor",
          t.estado,
          t.created_at AS "createdAt",
          t.updated_at AS "updatedAt",
          c.id AS "conversacionId",
          CASE
            WHEN t.comprador_id = ${userId} THEN 'comprador'
            ELSE 'vendedor'
          END AS rol
        FROM transacciones t
        INNER JOIN publicaciones p ON p.id = t.publicacion_id
        INNER JOIN usuarios comprador ON comprador.id = t.comprador_id
        INNER JOIN usuarios vendedor ON vendedor.id = t.vendedor_id
        LEFT JOIN conversaciones c
          ON c.publicacion_id = t.publicacion_id
         AND c.interesado_id = t.comprador_id
         AND c.dueno_id = t.vendedor_id
        WHERE t.comprador_id = ${userId}
           OR t.vendedor_id = ${userId}
        ORDER BY t.created_at DESC, t.id DESC
      `;
      sendJson(response, 200, {
        transacciones: rows.map((row) => ({
          ...row,
          id: String(row.id),
        })),
      });
      return;
    }

    if (request.method === "POST") {
      const publicationId = parseId(data.publicacionId);
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

      const [publication] = await sql`
        SELECT id, usuario_id, tipo, precio, estado
        FROM publicaciones
        WHERE id = ${publicationId}
        LIMIT 1
      `;
      if (!publication) {
        sendJson(response, 404, { error: "No se encontró esa publicación." });
        return;
      }
      if (String(publication.usuario_id) === String(userId)) {
        sendJson(response, 400, {
          error: "No puedes comprar tu propia publicación.",
        });
        return;
      }
      if (publication.estado !== "activa" || publication.tipo !== "venta") {
        sendJson(response, 409, {
          error: "La publicación ya no está disponible para la venta.",
        });
        return;
      }
      const listingPrice = Number(publication.precio);
      if (
        !Number.isFinite(listingPrice) ||
        listingPrice < 1 ||
        listingPrice > 99999.99
      ) {
        sendJson(response, 409, {
          error: "La publicación no tiene un precio de venta válido.",
        });
        return;
      }

      const [created] = await sql`
        WITH candidate AS MATERIALIZED (
          SELECT
            p.id,
            p.usuario_id AS vendedor_id,
            p.categoria,
            p.marca,
            p.precio
          FROM publicaciones p
          WHERE p.id = ${publicationId}
            AND p.tipo = 'venta'
            AND p.estado = 'activa'
            AND p.usuario_id <> ${userId}
          FOR UPDATE
        ),
        inserted AS (
          INSERT INTO transacciones (
            publicacion_id,
            comprador_id,
            vendedor_id,
            precio,
            comision_pct,
            comision,
            neto_vendedor,
            estado
          )
          SELECT
            candidate.id,
            ${userId},
            candidate.vendedor_id,
            candidate.precio,
            ${COMISION_PCT},
            ROUND(candidate.precio * ${COMISION_PCT} / 100, 2),
            candidate.precio - ROUND(candidate.precio * ${COMISION_PCT} / 100, 2),
            'reservada'
          FROM candidate
          ON CONFLICT (publicacion_id)
            WHERE estado IN ('reservada', 'pagada', 'entregada')
          DO NOTHING
          RETURNING id, publicacion_id, comprador_id, vendedor_id
        ),
        conversation AS (
          INSERT INTO conversaciones (
            publicacion_id,
            interesado_id,
            dueno_id
          )
          SELECT
            inserted.publicacion_id,
            inserted.comprador_id,
            inserted.vendedor_id
          FROM inserted
          ON CONFLICT (publicacion_id, interesado_id)
          DO UPDATE SET dueno_id = EXCLUDED.dueno_id
          RETURNING id, publicacion_id, interesado_id
        ),
        automatic_message AS (
          INSERT INTO mensajes (conversacion_id, autor_id, texto)
          SELECT
            conversation.id,
            inserted.comprador_id,
            'Quiero comprar tu ' || candidate.categoria ||
              CASE
                WHEN NULLIF(BTRIM(candidate.marca), '') IS NULL THEN ''
                ELSE ' ' || BTRIM(candidate.marca)
              END ||
              '. Coordinemos el punto de encuentro.'
          FROM inserted
          INNER JOIN candidate ON candidate.id = inserted.publicacion_id
          INNER JOIN conversation
            ON conversation.publicacion_id = inserted.publicacion_id
           AND conversation.interesado_id = inserted.comprador_id
          RETURNING id
        )
        SELECT inserted.id, conversation.id AS "conversationId"
        FROM inserted
        INNER JOIN conversation
          ON conversation.publicacion_id = inserted.publicacion_id
         AND conversation.interesado_id = inserted.comprador_id
        LEFT JOIN automatic_message ON TRUE
      `;
      if (!created) {
        sendJson(response, 409, {
          error: "Esta publicación ya tiene una compra en curso.",
        });
        return;
      }
      sendJson(response, 201, {
        transaccion: { id: String(created.id), estado: "reservada" },
        conversacionId: String(created.conversationId),
      });
      return;
    }

    const transactionId = parseId(data.id);
    const [transaction] = await sql`
      SELECT id, publicacion_id, comprador_id, vendedor_id, estado
      FROM transacciones
      WHERE id = ${transactionId}
      LIMIT 1
    `;
    if (!transaction) {
      sendJson(response, 404, { error: "No se encontró esa transacción." });
      return;
    }
    const isBuyer = String(transaction.comprador_id) === String(userId);
    const isSeller = String(transaction.vendedor_id) === String(userId);
    if (!isBuyer && !isSeller) {
      sendJson(response, 403, {
        error: "No participas en esta transacción.",
      });
      return;
    }

    const transitions = {
      pagar: { role: "comprador", from: "reservada", to: "pagada" },
      entregar: { role: "vendedor", from: "pagada", to: "entregada" },
      confirmar: { role: "comprador", from: "entregada", to: "completada" },
      cancelar: { role: "participante", from: ["reservada", "pagada"], to: "cancelada" },
    };
    const transition = transitions[data.accion];
    const allowedStates = transition
      ? Array.isArray(transition.from)
        ? transition.from
        : [transition.from]
      : [];
    if (
      !ACTIONS.has(data.accion) ||
      !transition ||
      (transition.role === "comprador" && !isBuyer) ||
      (transition.role === "vendedor" && !isSeller) ||
      !allowedStates.includes(transaction.estado)
    ) {
      sendJson(response, 409, {
        error: "La acción no está permitida para el rol o estado actual.",
      });
      return;
    }

    let updated;
    if (data.accion === "confirmar") {
      [updated] = await sql`
        WITH eligible AS MATERIALIZED (
          SELECT t.id, t.publicacion_id, t.comprador_id
          FROM transacciones t
          INNER JOIN publicaciones p ON p.id = t.publicacion_id
          WHERE t.id = ${transactionId}
            AND t.comprador_id = ${userId}
            AND t.estado = 'entregada'
            AND p.estado = 'activa'
          FOR UPDATE OF t, p
        ),
        delivered_publication AS (
          UPDATE publicaciones p
          SET estado = 'entregada', entregada_a = eligible.comprador_id
          FROM eligible
          WHERE p.id = eligible.publicacion_id
            AND p.estado = 'activa'
          RETURNING p.id
        ),
        completed AS (
          UPDATE transacciones t
          SET estado = 'completada', updated_at = NOW()
          FROM eligible
          INNER JOIN delivered_publication
            ON delivered_publication.id = eligible.publicacion_id
          WHERE t.id = eligible.id
            AND t.comprador_id = ${userId}
            AND t.estado = 'entregada'
          RETURNING t.id
        )
        SELECT id FROM completed
      `;
    } else {
      [updated] = await sql`
        UPDATE transacciones
        SET estado = ${transition.to}, updated_at = NOW()
        WHERE id = ${transactionId}
          AND estado = ${transaction.estado}
          AND (
            (${data.accion} = 'pagar' AND comprador_id = ${userId})
            OR (${data.accion} = 'entregar' AND vendedor_id = ${userId})
            OR (
              ${data.accion} = 'cancelar'
              AND (comprador_id = ${userId} OR vendedor_id = ${userId})
              AND estado IN ('reservada', 'pagada')
            )
          )
        RETURNING id, estado
      `;
    }
    if (!updated) {
      sendJson(response, 409, {
        error: "La transacción cambió y ya no permite esa acción.",
      });
      return;
    }
    sendJson(response, 200, {
      transaccion: {
        id: String(updated.id),
        estado: transition.to,
      },
    });
  } catch (error) {
    console.error("No se pudo procesar la transacción.", error);
    sendJson(response, 500, {
      error: "No se pudo completar la transacción. Inténtalo más tarde.",
    });
  }
}
