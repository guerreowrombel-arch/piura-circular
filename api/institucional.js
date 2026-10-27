import jwt from "jsonwebtoken";
import { getDatabase } from "../db.js";
import {
  clearSessionCookie,
  methodNotAllowed,
  readJsonBody,
  readSessionUserId,
  sendJson,
} from "../auth.js";

const PLANS = new Set(["Básico", "Institucional"]);

export function isValidPlan(plan) {
  return PLANS.has(plan);
}

function readUserId(request, response) {
  try {
    const userId = readSessionUserId(request);
    if (userId) return userId;
    sendJson(response, 401, { error: "Inicia sesión para acceder al panel institucional." });
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

async function findEntity(sql, userId) {
  const [record] = await sql`
    SELECT u.rol, e.id AS "entityId", e.nombre AS "entityName", e.plan
    FROM usuarios u
    LEFT JOIN entidades e ON e.usuario_id = u.id
    WHERE u.id = ${userId}
    LIMIT 1
  `;
  return record || null;
}

export default async function institutional(request, response) {
  if (!["GET", "POST"].includes(request.method)) {
    methodNotAllowed(response, ["GET", "POST"]);
    return;
  }

  let userId;
  try {
    userId = readUserId(request, response);
  } catch (error) {
    console.error("No se pudo verificar la sesión institucional.", error);
    sendJson(response, 500, { error: "No se pudo verificar la sesión." });
    return;
  }
  if (!userId) return;

  let data;
  if (request.method === "POST") {
    try {
      data = readJsonBody(request);
    } catch {
      sendJson(response, 400, { error: "El cuerpo de la solicitud no es JSON válido." });
      return;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      sendJson(response, 400, { error: "El cuerpo debe ser un objeto JSON." });
      return;
    }
  }

  try {
    const sql = getDatabase();
    const entity = await findEntity(sql, userId);
    if (!entity) {
      clearSessionCookie(response);
      sendJson(response, 401, {
        error: "La cuenta de esta sesión ya no existe. Inicia sesión nuevamente.",
      });
      return;
    }
    if (entity.rol !== "entidad" || !entity.entityId) {
      sendJson(response, 403, {
        error: "Esta función está disponible solo para cuentas de entidad.",
      });
      return;
    }

    if (request.method === "POST") {
      if (!isValidPlan(data.plan)) {
        sendJson(response, 400, {
          error: "Selecciona el plan Básico o Institucional.",
        });
        return;
      }
      const [updatedEntity] = await sql`
        UPDATE entidades
        SET plan = ${data.plan}
        WHERE id = ${entity.entityId}
          AND usuario_id = ${userId}
        RETURNING nombre, plan
      `;
      if (!updatedEntity) {
        sendJson(response, 403, {
          error: "No tienes permiso para modificar esta entidad.",
        });
        return;
      }
      sendJson(response, 200, {
        entidad: {
          nombre: updatedEntity.nombre,
          plan: updatedEntity.plan,
        },
      });
      return;
    }

    const [summary] = await sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE condicion = 'Operativo')::int AS operativo,
        COUNT(*) FILTER (WHERE condicion = 'Requiere reparación')::int
          AS "requiereReparacion",
        COUNT(*) FILTER (WHERE condicion = 'No reutilizable')::int
          AS "derivadasAcopio"
      FROM publicaciones
    `;
    const byDistrict = await sql`
      WITH district_totals AS (
        SELECT u.distrito, COUNT(*)::int AS total
        FROM publicaciones p
        INNER JOIN usuarios u ON u.id = p.usuario_id
        GROUP BY u.distrito
      )
      SELECT
        CASE WHEN total < 3 THEN 'Otros' ELSE distrito END AS distrito,
        SUM(total)::int AS total
      FROM district_totals
      GROUP BY 1
      ORDER BY total DESC, distrito ASC
    `;
    const byMonth = await sql`
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
          date_trunc('month', CURRENT_DATE),
          INTERVAL '1 month'
        ) AS month_start
      ),
      monthly_publications AS (
        SELECT date_trunc('month', created_at) AS month_start, COUNT(*)::int AS total
        FROM publicaciones
        WHERE created_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
          AND created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
        GROUP BY date_trunc('month', created_at)
      )
      SELECT
        to_char(months.month_start, 'YYYY-MM') AS mes,
        COALESCE(monthly_publications.total, 0)::int AS total
      FROM months
      LEFT JOIN monthly_publications
        ON monthly_publications.month_start = months.month_start
      ORDER BY months.month_start ASC
    `;

    sendJson(response, 200, {
      entidad: {
        nombre: entity.entityName,
        plan: entity.plan,
      },
      publicaciones: {
        total: Number(summary?.total || 0),
        operativo: Number(summary?.operativo || 0),
        requiereReparacion: Number(summary?.requiereReparacion || 0),
        derivadasAcopio: Number(summary?.derivadasAcopio || 0),
      },
      porDistrito: byDistrict.map((row) => ({
        distrito: row.distrito,
        total: Number(row.total),
      })),
      porMes: byMonth.map((row) => ({
        mes: row.mes,
        total: Number(row.total),
      })),
    });
  } catch (error) {
    console.error("No se pudo procesar la solicitud institucional.", error);
    sendJson(response, 500, {
      error: "No se pudo completar la solicitud institucional.",
    });
  }
}
