import { sendJson } from "../auth.js";
import perfil from "../handlers/perfil.js";
import password from "../handlers/password.js";
import misPublicaciones from "../handlers/mis-publicaciones.js";
import calificaciones from "../handlers/calificaciones.js";

const handlers = {
  perfil,
  password,
  "mis-publicaciones": misPublicaciones,
  calificaciones,
};

export default async function cuenta(request, response) {
  const url = new URL(request.url || "/api/cuenta", "https://example.com");
  const accion = url.searchParams.get("accion");
  const handler = handlers[accion];

  if (!handler) {
    sendJson(response, 404, {
      error: "La acción solicitada no existe.",
    });
    return;
  }

  return handler(request, response);
}
