import { sendJson } from "../auth.js";
import registro from "../handlers/registro.js";
import login from "../handlers/login.js";
import logout from "../handlers/logout.js";
import me from "../handlers/me.js";

const handlers = {
  registro,
  login,
  logout,
  me,
};

export default async function auth(request, response) {
  const url = new URL(request.url || "/api/auth", "https://example.com");
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
