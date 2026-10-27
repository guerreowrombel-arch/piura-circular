import jwt from "jsonwebtoken";
import { getDatabase } from "../db.js";
import {
  clearSessionCookie,
  methodNotAllowed,
  readJsonBody,
  readSessionUserId,
  sendJson,
} from "../auth.js";

const BASIC_PLAN_POINT_LIMIT = 3;
const BASIC_PLAN_ERROR =
  "Tu plan Básico permite hasta 3 puntos. Cambia al plan Institucional.";

function readUserId(request, response) {
  try {
    const userId = readSessionUserId(request);
    if (userId) return userId;
    sendJson(response, 401, { error: "Inicia sesión con una cuenta de entidad." });
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
  const [entity] = await sql`
    SELECT u.rol, e.id AS "entityId", e.plan
    FROM usuarios u
    LEFT JOIN entidades e ON e.usuario_id = u.id
    WHERE u.id = ${userId}
    LIMIT 1
  `;
  return entity || null;
}

function readPointId(request) {
  const url = new URL(request.url, "http://localhost");
  const value = request.query?.id ?? url.searchParams.get("id");
  return parsePointId(value);
}

function parsePointId(value) {
  const id = typeof value === "string" ? value : String(value ?? "");
  return /^[1-9]\d{0,18}$/.test(id) ? id : null;
}

function readCoordinate(value) {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !value.trim())
  ) {
    return null;
  }
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

export function validatePoint(data, { allowActive = false } = {}) {
  const name = typeof data.nombre === "string" ? data.nombre.trim() : "";
  const address = typeof data.direccion === "string" ? data.direccion.trim() : "";
  const district = typeof data.distrito === "string" ? data.distrito.trim() : "";
  const hours =
    data.horario === undefined
      ? ""
      : typeof data.horario === "string"
        ? data.horario.trim()
        : null;
  const categories = data.categorias;
  const lat = readCoordinate(data.lat);
  const lng = readCoordinate(data.lng);

  if (
    !name ||
    name.length > 150 ||
    !address ||
    address.length > 150 ||
    !district ||
    district.length > 150
  ) {
    return { error: "Nombre, dirección y distrito son obligatorios (máximo 150 caracteres)." };
  }
  if (hours === null || hours.length > 150) {
    return { error: "El horario debe ser texto de máximo 150 caracteres." };
  }
  if (
    !Array.isArray(categories) ||
    categories.some(
      (category) =>
        !Number.isInteger(category) || category < 1 || category > 10,
    )
  ) {
    return { error: "Las categorías deben ser un arreglo de enteros del 1 al 10." };
  }
  if (lat === null || lat < -18.5 || lat > 0) {
    return { error: "La latitud debe estar entre -18.5 y 0." };
  }
  if (lng === null || lng < -81.5 || lng > -68) {
    return { error: "La longitud debe estar entre -81.5 y -68." };
  }
  if (allowActive && data.activo !== undefined && typeof data.activo !== "boolean") {
    return { error: "El campo activo debe ser booleano." };
  }

  return {
    point: {
      nombre: name,
      direccion: address,
      distrito: district,
      horario: hours,
      categorias: categories,
      lat,
      lng,
      ...(allowActive && data.activo !== undefined
        ? { activo: data.activo }
        : {}),
    },
  };
}

async function requireEntity(sql, userId, response) {
  const entity = await findEntity(sql, userId);
  if (!entity) {
    clearSessionCookie(response);
    sendJson(response, 401, {
      error: "La cuenta de esta sesión ya no existe. Inicia sesión nuevamente.",
    });
    return null;
  }
  if (entity.rol !== "entidad" || !entity.entityId) {
    sendJson(response, 403, {
      error: "Esta función está disponible solo para cuentas de entidad.",
    });
    return null;
  }
  return entity;
}

async function ensureActivePointCapacity(sql, entity) {
  if (entity.plan !== "Básico") return true;
  const [result] = await sql`
    SELECT COUNT(*)::int AS total
    FROM puntos_acopio
    WHERE entidad_id = ${entity.entityId}
      AND activo = TRUE
  `;
  return Number(result?.total || 0) < BASIC_PLAN_POINT_LIMIT;
}

export default async function points(request, response) {
  if (request.method === "GET") {
    const url = new URL(request.url, "http://localhost");
    const ownPoints =
      request.query?.propios === "1" || url.searchParams.get("propios") === "1";
    let userId;
    if (ownPoints) {
      try {
        userId = readUserId(request, response);
      } catch (error) {
        console.error("No se pudo verificar la sesión de puntos.", error);
        sendJson(response, 500, { error: "No se pudo verificar la sesión." });
        return;
      }
      if (!userId) return;
    }

    try {
      const sql = getDatabase();
      let rows;
      if (ownPoints) {
        const entity = await requireEntity(sql, userId, response);
        if (!entity) return;
        rows = await sql`
          SELECT
            p.id,
            p.nombre,
            p.direccion,
            p.distrito,
            p.horario,
            p.categorias,
            p.lat,
            p.lng,
            p.activo,
            e.nombre AS "entidadNombre"
          FROM puntos_acopio p
          INNER JOIN entidades e ON e.id = p.entidad_id
          WHERE p.entidad_id = ${entity.entityId}
          ORDER BY p.activo DESC, p.distrito ASC, p.nombre ASC, p.id ASC
        `;
      } else {
        rows = await sql`
          SELECT
            p.id,
            p.nombre,
            p.direccion,
            p.distrito,
            p.horario,
            p.categorias,
            p.lat,
            p.lng,
            e.nombre AS "entidadNombre"
          FROM puntos_acopio p
          INNER JOIN entidades e ON e.id = p.entidad_id
          WHERE p.activo = TRUE
          ORDER BY p.distrito ASC, p.nombre ASC, p.id ASC
        `;
      }
      sendJson(response, 200, {
        puntos: rows.map((row) => ({
          ...row,
          id: String(row.id),
          categorias: Array.isArray(row.categorias) ? row.categorias : [],
        })),
      });
    } catch (error) {
      console.error("No se pudieron cargar los puntos institucionales.", error);
      sendJson(response, 500, {
        error: "No se pudieron cargar los puntos de acopio.",
      });
    }
    return;
  }

  if (!["POST", "PUT", "DELETE"].includes(request.method)) {
    methodNotAllowed(response, ["GET", "POST", "PUT", "DELETE"]);
    return;
  }

  let userId;
  try {
    userId = readUserId(request, response);
  } catch (error) {
    console.error("No se pudo verificar la sesión de puntos.", error);
    sendJson(response, 500, { error: "No se pudo verificar la sesión." });
    return;
  }
  if (!userId) return;

  let data = {};
  if (request.method !== "DELETE") {
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

  const pointId =
    request.method === "PUT"
      ? parsePointId(
          data.id ??
            request.query?.id ??
            new URL(request.url, "http://localhost").searchParams.get("id"),
        )
      : request.method === "DELETE"
        ? readPointId(request)
        : null;
  if (request.method !== "POST" && !pointId) {
    sendJson(response, 400, { error: "Indica un punto de acopio válido." });
    return;
  }

  try {
    const sql = getDatabase();
    const entity = await requireEntity(sql, userId, response);
    if (!entity) return;

    if (request.method === "POST") {
      const validatedPoint = validatePoint(data, { allowActive: true });
      if (validatedPoint.error) {
        sendJson(response, 400, { error: validatedPoint.error });
        return;
      }
      const point = validatedPoint.point;
      const active = point.activo ?? true;
      if (active && !(await ensureActivePointCapacity(sql, entity))) {
        sendJson(response, 403, { error: BASIC_PLAN_ERROR });
        return;
      }
      const [created] = await sql`
        INSERT INTO puntos_acopio (
          entidad_id, nombre, direccion, distrito, horario, categorias, lat, lng,
          activo
        )
        VALUES (
          ${entity.entityId},
          ${point.nombre},
          ${point.direccion},
          ${point.distrito},
          ${point.horario},
          ${JSON.stringify(point.categorias)}::jsonb,
          ${point.lat},
          ${point.lng},
          ${active}
        )
        RETURNING id, nombre, direccion, distrito, horario, categorias, lat, lng,
          activo, created_at AS "createdAt"
      `;
      sendJson(response, 201, {
        punto: {
          ...created,
          id: String(created.id),
          categorias: Array.isArray(created.categorias) ? created.categorias : [],
        },
      });
      return;
    }

    const [ownedPoint] = await sql`
      SELECT id, activo
      FROM puntos_acopio
      WHERE id = ${pointId}
        AND entidad_id = ${entity.entityId}
      LIMIT 1
    `;
    if (!ownedPoint) {
      sendJson(response, 403, {
        error: "No tienes permiso para modificar este punto de acopio.",
      });
      return;
    }

    if (request.method === "DELETE") {
      await sql`
        UPDATE puntos_acopio
        SET activo = FALSE
        WHERE id = ${pointId}
          AND entidad_id = ${entity.entityId}
      `;
      sendJson(response, 200, { ok: true, id: String(pointId), activo: false });
      return;
    }

    const validatedPoint = validatePoint(data, { allowActive: true });
    if (validatedPoint.error) {
      sendJson(response, 400, { error: validatedPoint.error });
      return;
    }

    const point = validatedPoint.point;
    const nextActive = point.activo ?? ownedPoint.activo;
    if (
      nextActive &&
      !ownedPoint.activo &&
      !(await ensureActivePointCapacity(sql, entity))
    ) {
      sendJson(response, 403, { error: BASIC_PLAN_ERROR });
      return;
    }
    const [updated] = await sql`
      UPDATE puntos_acopio
      SET
        nombre = ${point.nombre},
        direccion = ${point.direccion},
        distrito = ${point.distrito},
        horario = ${point.horario},
        categorias = ${JSON.stringify(point.categorias)}::jsonb,
        lat = ${point.lat},
        lng = ${point.lng},
        activo = ${nextActive}
      WHERE id = ${pointId}
        AND entidad_id = ${entity.entityId}
      RETURNING id, nombre, direccion, distrito, horario, categorias, lat, lng,
        activo, created_at AS "createdAt"
    `;
    sendJson(response, 200, {
      punto: {
        ...updated,
        id: String(updated.id),
        categorias: Array.isArray(updated.categorias) ? updated.categorias : [],
      },
    });
  } catch (error) {
    console.error("No se pudo gestionar el punto de acopio.", error);
    sendJson(response, 500, {
      error: "No se pudo gestionar el punto de acopio.",
    });
  }
}
