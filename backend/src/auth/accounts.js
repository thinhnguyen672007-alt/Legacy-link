import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { ControlError } from "../control/validation.js";
const scrypt = promisify(scryptCallback);
export const tokenHash = (value) =>
  createHash("sha256").update(value).digest("hex");
export function validPassword(value) {
  if (
    typeof value !== "string" ||
    value.length < 12 ||
    Buffer.byteLength(value) > 256
  )
    throw new ControlError(
      "Password must contain at least 12 characters and at most 256 UTF-8 bytes",
    );
  return value;
}
export async function hashPassword(value) {
  validPassword(value);
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(value, salt, 64);
  return `${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(value, encoded) {
  if (typeof value !== "string" || Buffer.byteLength(value) > 256) return false;
  if (
    typeof encoded !== "string" ||
    !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(encoded)
  )
    return false;
  const [salt, hash] = encoded.split(":");
  const actual = await scrypt(value, salt, 64);
  return timingSafeEqual(actual, Buffer.from(hash, "hex"));
}
const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  role: u.role,
  disabled: u.disabled,
  mustChangePassword: u.must_change_password,
});
function username(value) {
  if (
    typeof value !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,47}$/.test(value)
  )
    throw new ControlError(
      "Username must contain 3–48 letters, digits, dots, underscores or hyphens",
    );
  return value.toLowerCase();
}
export function createAccounts(pool) {
  const dummy = hashPassword(randomBytes(24).toString("hex"));
  async function transaction(fn) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const out = await fn(c);
      await c.query("COMMIT");
      return out;
    } catch (e) {
      await c.query("ROLLBACK");
      if (e.code === "23505")
        throw new ControlError("Username already exists", 409);
      throw e;
    } finally {
      c.release();
    }
  }
  const audit = (c, actor, action, target, outcome = "success") =>
    c.query(
      "INSERT INTO account_audit(actor_id,action,target,outcome) VALUES($1,$2,$3,$4)",
      [actor, action, target, outcome],
    );
  return {
    async bootstrap(name, password) {
      const hash = await hashPassword(password),
        nameKey = username(name);
      return transaction(async (c) => {
        await c.query(
          "SELECT pg_advisory_xact_lock(hashtext('account-admins'))",
        );
        if ((await c.query("SELECT 1 FROM app_user LIMIT 1")).rowCount)
          throw new ControlError("Accounts already initialized", 409);
        const id = randomUUID();
        await c.query(
          "INSERT INTO app_user(id,username,password_hash,role,must_change_password) VALUES($1,$2,$3,'admin',false)",
          [id, nameKey, hash],
        );
        await audit(c, id, "bootstrap", id);
        return { id, username: nameKey };
      });
    },
    async login(body) {
      if (
        !body ||
        typeof body.username !== "string" ||
        typeof body.password !== "string"
      )
        throw new ControlError("Invalid credentials", 401);
      const name = body.username.toLowerCase();
      const u = (
        await pool.query("SELECT * FROM app_user WHERE username=$1", [name])
      ).rows[0];
      const ok = await verifyPassword(
        body.password,
        u?.password_hash ?? (await dummy),
      );
      if (!ok || !u || u.disabled)
        throw new ControlError("Invalid credentials", 401);
      return transaction(async (c) => {
        const current = (
          await c.query("SELECT * FROM app_user WHERE id=$1 FOR UPDATE", [u.id])
        ).rows[0];
        if (current.disabled || current.password_hash !== u.password_hash)
          throw new ControlError("Invalid credentials", 401);
        const token = randomBytes(32).toString("hex");
        await c.query("DELETE FROM app_session WHERE expires_at<=now()");
        await c.query(
          "INSERT INTO app_session VALUES($1,$2,now()+interval '8 hours')",
          [tokenHash(token), u.id],
        );
        await audit(c, u.id, "login", u.id);
        return { token, user: publicUser(current), expiresInSeconds: 28800 };
      });
    },
    async authenticate(token) {
      if (!/^[a-f0-9]{64}$/.test(token)) return null;
      const u = (
        await pool.query(
          "SELECT u.* FROM app_session s JOIN app_user u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND NOT u.disabled",
          [tokenHash(token)],
        )
      ).rows[0];
      return u ? publicUser(u) : null;
    },
    async logout(token) {
      await pool.query("DELETE FROM app_session WHERE token_hash=$1", [
        tokenHash(token),
      ]);
      return { ok: true };
    },
    async changePassword(actor, body) {
      const hash = await hashPassword(body?.password);
      return transaction(async (c) => {
        const u = (
          await c.query("SELECT * FROM app_user WHERE id=$1 FOR UPDATE", [
            actor.id,
          ])
        ).rows[0];
        if (
          !u ||
          u.disabled ||
          !(await verifyPassword(body?.currentPassword, u.password_hash))
        )
          throw new ControlError("Current password is incorrect", 403);
        await c.query(
          "UPDATE app_user SET password_hash=$2,must_change_password=false WHERE id=$1",
          [actor.id, hash],
        );
        await c.query("DELETE FROM app_session WHERE user_id=$1", [actor.id]);
        await audit(c, actor.id, "change_password", actor.id);
        return { ok: true };
      });
    },
    async list() {
      return (
        await pool.query("SELECT * FROM app_user ORDER BY username")
      ).rows.map(publicUser);
    },
    async create(actor, body) {
      if (!["viewer", "technician"].includes(body?.role))
        throw new ControlError("Choose viewer or technician");
      const name = username(body.username),
        hash = await hashPassword(body.password);
      return transaction(async (c) => {
        await requireAdmin(c, actor.id);
        const id = randomUUID();
        const u = (
          await c.query(
            "INSERT INTO app_user(id,username,password_hash,role) VALUES($1,$2,$3,$4) RETURNING *",
            [id, name, hash, body.role],
          )
        ).rows[0];
        await audit(c, actor.id, "create_user", id);
        return publicUser(u);
      });
    },
    async update(actor, id, body) {
      if (!/^[a-f0-9-]{36}$/.test(id))
        throw new ControlError("Invalid user ID");
      if (
        !body ||
        !Object.keys(body).length ||
        Object.keys(body).some(
          (k) => !["role", "disabled", "password"].includes(k),
        )
      )
        throw new ControlError("Invalid account update");
      if (
        body.role !== undefined &&
        !["viewer", "technician"].includes(body.role)
      )
        throw new ControlError("Choose viewer or technician");
      if (body.disabled !== undefined && typeof body.disabled !== "boolean")
        throw new ControlError("Invalid disabled flag");
      const hash =
        body.password === undefined ? null : await hashPassword(body.password);
      return transaction(async (c) => {
        await c.query(
          "SELECT pg_advisory_xact_lock(hashtext('account-admins'))",
        );
        await requireAdmin(c, actor.id);
        const u = (
          await c.query("SELECT * FROM app_user WHERE id=$1 FOR UPDATE", [id])
        ).rows[0];
        if (!u) throw new ControlError("Account not found", 404);
        if (
          u.role === "admin" &&
          (body.role !== undefined || body.disabled === true)
        )
          throw new ControlError(
            "Administrator cannot be disabled or demoted here",
            409,
          );
        const updated = (
          await c.query(
            "UPDATE app_user SET role=COALESCE($2,role),disabled=COALESCE($3,disabled),password_hash=COALESCE($4,password_hash),must_change_password=CASE WHEN $4::text IS NULL THEN must_change_password ELSE true END WHERE id=$1 RETURNING *",
            [id, body.role ?? null, body.disabled ?? null, hash],
          )
        ).rows[0];
        await c.query("DELETE FROM app_session WHERE user_id=$1", [id]);
        await audit(c, actor.id, hash ? "reset_password" : "update_user", id);
        return publicUser(updated);
      });
    },
    async history() {
      return (
        await pool.query(
          "SELECT a.*,u.username FROM account_audit a LEFT JOIN app_user u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 200",
        )
      ).rows;
    },
    async record(actor, action, target, outcome) {
      await audit(pool, actor.id, action, target, outcome);
    },
  };
}
async function requireAdmin(c, id) {
  const u = (
    await c.query(
      "SELECT role,disabled,must_change_password FROM app_user WHERE id=$1 FOR SHARE",
      [id],
    )
  ).rows[0];
  if (!u || u.disabled || u.role !== "admin" || u.must_change_password)
    throw new ControlError("Administrator permission required", 403);
}
