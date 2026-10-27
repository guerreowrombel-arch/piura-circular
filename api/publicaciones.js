import jwt from "jsonwebtoken";
import { getDatabase } from "../db.js";
import {
  clearSessionCookie,
  methodNotAllowed,
  readJsonBody,
  readSessionUserId,
  sendJson,
} from "../auth.js";

const CATEGORIES = new Set([
  "Computadoras",
  "Celulares",
  "Electrodomésticos",
  "Baterías",
  "Otros",
]);
const CONDITIONS = new Set([
  "Operativo",
  "Requiere reparación",
  "No reutilizable",
]);
const MAX_PHOTO_LENGTH = 1_000_000;
const JPEG_DATA_URL = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;

function isValidPhotos(photos) {
  return (
    Array.isArray(photos) &&
    photos.length <= 3 &&
    photos.reduce(
      (total, photo) =>
        total + (typeof photo === "string" ? photo.length : MAX_PHOTO_LENGTH + 1),
      0,
    ) <=
      MAX_PHOTO_LENGTH * 3 &&
    photos.every(
      (photo) =>
        typeof photo === "string" &&
        photo.length <= MAX_PHOTO_LENGTH &&
        JPEG_DATA_URL.test(photo),
    )
  );
}

function readUserId(request, response) {
  try {
    const userId = readSessionUserId(request);
    if (userId) return userId;
    sendJson(response, 401, { error: "Inicia sesión para publicar un equipo." });
  } catch (error) {
    if (
      error instanceof jwt.JsonWebTokenError ||
      error instanceof jwt.TokenExpiredError
    ) {
      clearSessionCookie(response);
      sendJson(response, 401, { error: "Tu sesión venció. Inicia sesión nuevamente." });
      return null;
    }
    throw error;
  }
  return null;
}

export default async function publications(request, response) {
  if (request.method === "GET") {
    try {
      const sql = getDatabase();
      const requestUrl = new URL(request.url, "http://localhost");
      const summaryOnly = requestUrl.searchParams.get("summary") === "1";
      if (summaryOnly) {
        const [summary] = await sql`
          SELECT
            COUNT(*)::int AS published,
            COUNT(*) FILTER (WHERE condicion = 'Operativo')::int AS operational,
            COUNT(*) FILTER (WHERE condicion = 'No reutilizable')::int AS collection
          FROM publicaciones
        `;
        sendJson(response, 200, {
          counts: {
            published: summary.published,
            operational: summary.operational,
            collection: summary.collection,
          },
        });
        return;
      }

      const rows = await sql`
        SELECT
          p.id,
          p.categoria AS category,
          p.marca AS brand,
          p.antiguedad AS age,
          p.descripcion AS description,
          p.condicion AS condition,
          p.fotos AS photos,
          p.created_at AS "createdAt",
          u.nombre AS "authorName",
          LEFT(BTRIM(u.apellidos), 1) AS "authorInitial",
          u.distrito AS district
        FROM publicaciones p
        INNER JOIN usuarios u ON u.id = p.usuario_id
        ORDER BY p.created_at DESC, p.id DESC
      `;
      sendJson(
        response,
        200,
        {
          publications: rows.map((row) => ({
            ...row,
            id: String(row.id),
            photos: Array.isArray(row.photos) ? row.photos : [],
          })),
        },
      );
    } catch (error) {
      console.error("No se pudieron cargar las publicaciones.", error);
      sendJson(response, 500, {
        error: "No se pudieron cargar las publicaciones. Inténtalo más tarde.",
      });
    }
    return;
  }

  if (request.method !== "POST") {
    methodNotAllowed(response, ["GET", "POST"]);
    return;
  }

  let userId;
  try {
    userId = readUserId(request, response);
  } catch (error) {
    console.error("No se pudo verificar la sesión para publicar.", error);
    sendJson(response, 500, { error: "No se pudo verificar la sesión." });
    return;
  }
  if (!userId) return;

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

  const category = typeof data.category === "string" ? data.category.trim() : "";
  const brand = typeof data.brand === "string" ? data.brand.trim() : "";
  const age = typeof data.age === "string" ? data.age.trim() : "";
  const description =
    typeof data.description === "string" ? data.description.trim() : "";
  const condition =
    typeof data.condition === "string" ? data.condition.trim() : "";
  const photos = data.photos === undefined ? [] : data.photos;

  if (!CATEGORIES.has(category)) {
    sendJson(response, 400, { error: "Selecciona una categoría válida." });
    return;
  }
  if (!description || description.length > 1000) {
    sendJson(response, 400, {
      error: "La descripción debe tener entre 1 y 1000 caracteres.",
    });
    return;
  }
  if (!CONDITIONS.has(condition)) {
    sendJson(response, 400, { error: "Selecciona una condición válida." });
    return;
  }
  if (brand.length > 100 || age.length > 50) {
    sendJson(response, 400, { error: "Revisa la marca o antigüedad del equipo." });
    return;
  }
  if (!isValidPhotos(photos)) {
    sendJson(response, 400, {
      error: "Adjunta como máximo 3 fotos JPEG válidas.",
    });
    return;
  }

  try {
    const sql = getDatabase();
    const [publication] = await sql`
      INSERT INTO publicaciones (
        usuario_id,
        categoria,
        marca,
        antiguedad,
        descripcion,
        condicion,
        fotos
      )
      SELECT
        u.id,
        ${category},
        ${brand},
        ${age},
        ${description},
        ${condition},
        ${JSON.stringify(photos)}::jsonb
      FROM usuarios u
      WHERE u.id = ${userId}
      RETURNING
        id,
        categoria AS category,
        marca AS brand,
        antiguedad AS age,
        descripcion AS description,
        condicion AS condition,
        fotos AS photos,
        created_at AS "createdAt"
    `;

    if (!publication) {
      clearSessionCookie(response);
      sendJson(response, 401, {
        error: "La cuenta de esta sesión ya no existe. Inicia sesión nuevamente.",
      });
      return;
    }
    sendJson(response, 201, {
      publication: {
        ...publication,
        id: String(publication.id),
        photos: Array.isArray(publication.photos) ? publication.photos : [],
      },
    });
  } catch (error) {
    console.error("No se pudo guardar la publicación.", error);
    sendJson(response, 500, {
      error: "No se pudo guardar la publicación. Inténtalo de nuevo más tarde.",
    });
  }
}
