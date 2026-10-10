import { createSecurity } from "../http/security.js";
import { ControlError } from "../control/validation.js";
export function accountSecurity(settings, accounts) {
  const legacy = createSecurity(settings);
  // Reuse origin/header policy without granting account privileges.
  const headers = createSecurity({ ...settings, disabled: true });
  return async (req, res, path) => {
    headers(req, res, path);
    if (
      req.method === "OPTIONS" ||
      ["/health", "/health/live", "/health/ready"].includes(path)
    )
      return;
    if (path === "/auth/login") return;
    const token =
      /^Bearer ([^\s]+)$/.exec(req.headers.authorization ?? "")?.[1] ?? "";
    req.sessionToken = token;
    const user = await accounts.authenticate(token);
    if (!user) {
      if (path.startsWith("/auth/") || path.startsWith("/admin/"))
        throw new ControlError("Authentication required", 401);
      return legacy(req, res, path);
    }
    req.actor = user;
    if (
      user.mustChangePassword &&
      !["/auth/me", "/auth/password", "/auth/logout"].includes(path)
    )
      throw new ControlError("Change your temporary password first", 403);
    if (path.startsWith("/admin/") && user.role !== "admin")
      throw new ControlError("Administrator permission required", 403);
    if (
      !path.startsWith("/auth/") &&
      !["GET", "HEAD"].includes(req.method) &&
      // Copilot dùng POST để gửi câu hỏi nhưng chỉ đọc dữ liệu.
      !(req.method === "POST" && ["/ai/chat", "/ai/query"].includes(path)) &&
      user.role === "viewer"
    )
      throw new ControlError("Write permission required", 403);
  };
}
