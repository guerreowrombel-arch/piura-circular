import {
  clearSessionCookie,
  methodNotAllowed,
  sendJson,
} from "../auth.js";

export default async function logout(request, response) {
  if (request.method !== "POST") {
    methodNotAllowed(response, ["POST"]);
    return;
  }

  clearSessionCookie(response);
  sendJson(response, 200, { success: true });
}
