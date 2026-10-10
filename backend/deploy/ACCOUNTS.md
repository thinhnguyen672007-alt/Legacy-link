# Employee accounts

The browser now signs in with a username and password. The backend assigns one of three roles:

| Role | Access |
| --- | --- |
| viewer | Read data |
| technician | Read data, acknowledge alarms and configure devices/profiles |
| admin | Technician access plus employee management and audit history |

There is no public registration. An administrator creates viewers or technicians. The administrator cannot be disabled or demoted through the employee API. Legacy API tokens remain available for existing scripts; they cannot access account administration or impersonate an employee.

## Upgrade and initialize

Back up the database first. Run `npm run db:migrate` from `backend` to install schema version 5, then restart the API and consumer. Readiness will reject a schema older than the code expects. No firmware update is needed.

Create the first administrator once, from the backend host (never put the password in a committed file or command-line argument):

```bash
cd backend
read -r -p 'Admin username: ' ADMIN_USERNAME
read -r -s -p 'Admin password (12+ characters): ' ADMIN_PASSWORD
export ADMIN_USERNAME ADMIN_PASSWORD
npm run accounts:bootstrap
unset ADMIN_USERNAME ADMIN_PASSWORD
```

The command refuses to run when any account already exists. There is no built-in/default administrator password. Use the correct database environment for the target deployment. In Compose, invoke the same script inside the API image with these environment variables passed explicitly; rebuild the image and migrate before restart.

## Employee lifecycle

1. Sign in as administrator and open **Employees / Nhân viên**.
2. Create a username, temporary password and Viewer/Technician role.
3. Give the credentials privately to that employee. The first sign-in requires a password change.
4. Role changes, disable, password reset and password change revoke all existing sessions for the affected employee. Already accepted operations are not retroactively canceled.
5. A password reset requires another first-login password change. Re-enabling an account does not restore old sessions.

Passwords use salted scrypt hashes. Session tokens are random, stored only as SHA-256 hashes in PostgreSQL, expire after eight hours and stay in browser memory. Refreshing the page requires signing in again. Logout removes the server session. Use HTTPS for real deployments; a private HTTP bench does not encrypt passwords in transit.

The existing API rate limiter also covers login requests. Limits are per socket IP/process; users behind a proxy share a bucket. This is a small deployment design, not enterprise SSO or MFA.

## API

All request/response bodies are JSON; session authentication uses `Authorization: Bearer <session-token>`.

- `POST /auth/login`: `{username,password}` -> `{token,user,expiresInSeconds}`.
- `GET /auth/me`: current user and role.
- `POST /auth/logout`: revoke current session.
- `POST /auth/password`: `{currentPassword,password}`; revokes all sessions.
- `GET /admin/users`: administrator only; public account fields, never password hashes.
- `POST /admin/users/create`: `{username,password,role}`; role is viewer or technician.
- `POST /admin/users/:id`: any of `{role,disabled,password}`; revokes sessions.
- `GET /admin/audit`: latest 200 entries.

Audit records include account creation/changes, successful logins, password changes and accepted/failed authenticated write requests. Operation acceptance is not physical application: use the operation ID and `/operations/:id` for the eventual result. Audit history does not log passwords, session tokens or request bodies. Legacy-token actions have no personal identity and do not become employee audit records.

## Validation

`npm run test:accounts` creates and removes its own PostgreSQL Docker container. It covers bootstrap replay, migration replay, role enforcement, mandatory password change, disabled users, role-change revocation, password reset, logout, expiry and protected administrator access. It never migrates an existing demo database.

## Local acceptance (2026-10-10)

- Account integration passed against a disposable PostgreSQL container, including migration replay, all three roles, session revocation and expiry.
- Existing MQTT ingestion integration passed after the schema change, including COMMIT/ACK replay, broker/database outages and diagnostics.
- Frontend: 30 tests, production build and ESLint passed. Browser inspection covered login, administrator navigation and the employee page at desktop/mobile widths.
- The authorized local bench database was backed up before migration to version 5. Consumer/API restarted successfully and readiness returned true. A randomly generated administrator was created locally; login, account listing and logout passed both directly and through the frontend's `/api` proxy.
- Deployment credentials, database backup and Compose overlays are local ignored files and are not part of this repository. No public/default production password is provided.

The frontend Docker image uses `/api` on its own origin by default. `API_UPSTREAM` configures Nginx's backend address. For Vite development the default remains `http://localhost:3000`; either can be overridden with `VITE_API_BASE_URL` at build time or the connection form.
