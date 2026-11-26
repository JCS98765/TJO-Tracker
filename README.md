# FE-TJO-Revival-Tracker (Hatchable)

Hatchable project: static page in `public/`, one endpoint in `api/people.js` (`/api/people`), data in Postgres (`migrations/001_init.sql`).

## Setup
Set the `ADMIN_PASSWORD` secret (declared in `hatchable.toml`). That is the owner password: it can do everything,
including creating user logins (Users tab) and reverting changes (History tab).
Logging in and tabs work exactly as before.

## Added
- Mobile: the people tables become stacked cards under 720px.
- `/roster.html` + `/api/public`: read-only public roster and upcoming events (no notes, status, decisions or Roblox names; purge-marked people hidden).
- `/api/roblox?u=name`: Roblox lookup (verifies the username, fixes capitalisation, shows the avatar). "Look up" button next to each username when logged in.
- Bulk actions: tick people (owner/user logins), then set status, decision, hosts, council or division for all at once (`op: "bulk"`, max 200).
- Rank check tab (logged in): compares each person's Current rank with their role in the Roblox group. Set the group ID under Configure in the Hatchable console (`roblox_group_id`). Uses `/api/roblox-group`; "use group rank" fixes go through `op: "setRanks"`.
