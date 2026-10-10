import { z } from "zod";
import { request, type Session } from "./client";
export const userSchema = z.object({
  id: z.string(),
  username: z.string(),
  role: z.enum(["viewer", "technician", "admin"]),
  disabled: z.boolean(),
  mustChangePassword: z.boolean(),
});
export type Account = z.infer<typeof userSchema>;
export const roleLabel = {
  viewer: "Viewer · Chỉ xem",
  technician: "Technician · Kỹ thuật",
  admin: "Admin · Quản trị",
};
export function login(base: string, username: string, password: string) {
  return request(
    base,
    "/auth/login",
    "",
    z.object({ token: z.string(), user: userSchema }),
    { method: "POST", body: { username, password } },
  );
}
export function accountsApi(s: Session) {
  const token = s.readToken || s.writeToken;
  const post = <T>(path: string, schema: z.ZodType<T>, body?: unknown) =>
    request(s.base, path, token, schema, { method: "POST", body });
  return {
    me: () => request(s.base, "/auth/me", token, userSchema),
    logout: () => post("/auth/logout", z.object({ ok: z.boolean() })),
    password: (currentPassword: string, password: string) =>
      post("/auth/password", z.object({ ok: z.boolean() }), {
        currentPassword,
        password,
      }),
    list: () => request(s.base, "/admin/users", token, z.array(userSchema)),
    create: (username: string, password: string, role: string) =>
      post("/admin/users/create", userSchema, { username, password, role }),
    update: (id: string, body: unknown) =>
      post("/admin/users/" + encodeURIComponent(id), userSchema, body),
    audit: () =>
      request(
        s.base,
        "/admin/audit",
        token,
        z.array(
          z.object({
            id: z.union([z.string(), z.number()]),
            username: z.string().nullable(),
            action: z.string(),
            target: z.string(),
            outcome: z.string(),
            created_at: z.string(),
          }),
        ),
      ),
  };
}
