# FE-TJO-Revival-Tracker (Hatchable)

Hatchable project: static page in `public/`, one endpoint in `api/people.js` (`/api/people`), data in Postgres (`migrations/001_init.sql`).

## Setup
Set the `ADMIN_PASSWORD` secret (declared in `hatchable.toml`). That is the owner password: it can do everything,
including creating user logins (Users tab) and reverting changes (History tab).
Logging in and tabs work exactly as before.
