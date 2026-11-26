import { db, config } from "hatchable";
import * as nc from "node:crypto";

// The Hatchable isolate only exposes a subset of node:crypto (randomUUID, getRandomValues, subtle, createHmac...).
// No scryptSync / createHash / timingSafeEqual / randomBytes, so hashing uses Web Crypto (SHA-256, PBKDF2).
const CR = nc.subtle ? nc : globalThis.crypto;
const enc = new TextEncoder();
const randomUUID = () => (typeof nc.randomUUID === "function" ? nc.randomUUID() : globalThis.crypto.randomUUID());
const hex = (buf) => Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, "0")).join("");
const unhex = (h) => {
  const s = String(h || "");
  const a = new Uint8Array(Math.floor(s.length / 2));
  for (let i = 0; i < a.length; i++) a[i] = parseInt(s.substr(i * 2, 2), 16) || 0;
  return a;
};
const randomHex = (n) => hex(CR.getRandomValues(new Uint8Array(n)));
const same = (a, b) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
};

// Handlers return { status, data }; the exported function at the bottom sends it.
const json = (data, status = 200) => ({ status, data });
const hdr = (req, k) => {
  const h = req.headers;
  const v = h && typeof h.get === "function" ? h.get(k) : h?.[k];
  return Array.isArray(v) ? v[0] : v || "";
};

const COUNCILS = ["Jedi Task Force", "Jedi Peacekeepers", "Librarians Assembly"];
const DIVS = ["Jedi Assault Team", "Temple Guard", "Jedi Shadows"];
// Older names stored before the renames, upgraded whenever data is loaded.
const CN = {
  "Council of Reconciliation": COUNCILS[0], "Council of Reassignment": COUNCILS[1], "Council of First Knowledge": COUNCILS[2],
  "Librarian's Assembly": COUNCILS[2], "Librarian’s Assembly": COUNCILS[2],
};
const DN = { "Jedi Task Force": DIVS[0], "Jedi Librarians": DIVS[2], Librarians: DIVS[2] };

// Branch keys: tf = Jedi Task Force, pk = Jedi Peacekeepers, la = Librarian's Assembly
const BR = ["", "tf", "pk", "la"];
const CB = { [COUNCILS[0]]: "tf", [COUNCILS[1]]: "pk", [COUNCILS[2]]: "la", [DIVS[0]]: "tf", [DIVS[1]]: "pk", [DIVS[2]]: "la" };
const COMM = {
  "Jedi Battlemasters": "tf", "Strategic Unit": "tf", "Diplomatic Corps": "tf",
  "Exploration Corps": "pk", "Acquisition Division": "pk", "Investigator Core": "pk",
  "Convocation of Instructors": "la", "Keepers of the Vault": "la", "Prophetic Council": "la",
};
const SCOPES = ["hr", "tf", "pk", "la", "events", "planner"];

const ENUMS = {
  status: ["unreviewed", "active", "semi", "inactive"],
  decision: ["undecided", "retain", "purge"],
  hosts: ["", "yes", "maybe", "no"],
  section: ["hr", "council", "division", "cor", "cora", "cofk", "JTF", "JP", "LA", "div"],
  council: ["", ...COUNCILS],
  division: ["", ...DIVS],
  branch: BR,
  committee: ["", ...Object.keys(COMM)],
};
const TEXT = ["name", "roblox", "rank", "group", "notes", "lastActive", "newRank"];
const sha = async (s) => new Uint8Array(await CR.subtle.digest("SHA-256", enc.encode(String(s))));
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const str = (o, p, k, n) => { if (typeof p[k] === "string") o[k] = p[k].trim().slice(0, n); };
const en = (o, p, k, l) => { if (typeof p[k] === "string" && l.includes(p[k])) o[k] = p[k]; };
const dt = (o, p, k) => { if (typeof p[k] === "string" && (p[k] === "" || DATE.test(p[k]))) o[k] = p[k]; };

function clean(p) {
  const o = {};
  for (const k of TEXT) str(o, p, k, 500);
  for (const k in ENUMS) en(o, p, k, ENUMS[k]);
  return o;
}
function cleanTask(p) {
  const o = {};
  str(o, p, "title", 200); str(o, p, "details", 1000);
  if (typeof p.assignee === "string") o.assignee = p.assignee.slice(0, 64);
  dt(o, p, "due");
  en(o, p, "status", ["todo", "doing", "hold", "done"]);
  en(o, p, "priority", ["low", "normal", "high"]);
  en(o, p, "category", ["general", "council", "division"]);
  en(o, p, "target", ["", ...COUNCILS, ...DIVS]);
  return o;
}
const CLEAN = {
  people: clean,
  tasks: cleanTask,
  rules: (p) => { const o = {}; str(o, p, "old", 80); str(o, p, "newRank", 80); en(o, p, "branch", BR); return o; },
  decisions: (p) => {
    const o = {}; str(o, p, "title", 200); str(o, p, "details", 2000); str(o, p, "by", 80); dt(o, p, "date");
    en(o, p, "status", ["pending", "approved", "rejected", "revisit"]); return o;
  },
  events: (p) => {
    const o = {}; str(o, p, "title", 200); str(o, p, "details", 2000); str(o, p, "host", 80); dt(o, p, "date");
    if (typeof p.time === "string" && (p.time === "" || /^\d{2}:\d{2}$/.test(p.time))) o.time = p.time;
    en(o, p, "type", ["revival", "training", "raid", "meeting", "other"]);
    en(o, p, "branch", BR); en(o, p, "status", ["planned", "done", "cancelled"]); return o;
  },
};
const DEF = {
  people: { name: "", section: "hr", council: "", division: "", roblox: "", rank: "", status: "unreviewed", lastActive: "", hosts: "", decision: "undecided", notes: "", branch: "", committee: "", newRank: "" },
  tasks: { title: "", details: "", assignee: "", due: "", status: "todo", priority: "normal", category: "general", target: "" },
  rules: { old: "", newRank: "", branch: "" },
  decisions: { title: "", details: "", status: "pending", date: "", by: "" },
  events: { title: "", details: "", date: "", time: "", type: "revival", branch: "", host: "", status: "planned" },
};
const REQ = { people: "name", tasks: "title", rules: "old", decisions: "title", events: "title" };
const MAX = { people: 2000, tasks: 1000, rules: 300, decisions: 500, events: 1000 };
const ALIAS = {
  add: ["people", "add"], update: ["people", "update"], delete: ["people", "delete"],
  addTask: ["tasks", "add"], updateTask: ["tasks", "update"], deleteTask: ["tasks", "delete"],
};

// Each collection is one JSON document in the kv table (same shape the Blobs store used).
async function kvGet(name) {
  const { rows } = await db.query("SELECT data FROM kv WHERE name = $1", [name]);
  return rows[0]?.data ?? null;
}
async function load(name) {
  const d = await kvGet(name);
  if (name === "seats") return d?.seats && typeof d.seats === "object" ? d.seats : {};
  const a = Array.isArray(d?.[name]) ? d[name] : [];
  if (name === "people") return a.map((x) => ({ ...x, ...(x.council ? { council: CN[x.council] || x.council } : {}), ...(x.division ? { division: DN[x.division] || x.division } : {}) }));
  if (name === "tasks") return a.map((x) => ({ ...x, priority: x.priority === "medium" ? "normal" : x.priority, ...(x.target ? { target: (x.category === "division" ? DN : CN)[x.target] || x.target } : {}) }));
  return a;
}
const save = (name, v) =>
  db.query(
    `INSERT INTO kv (name, data) VALUES ($1, $2::jsonb)
     ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [name, JSON.stringify({ [name]: v })]
  );
async function loadAll() {
  const S = {};
  await Promise.all(["people", "tasks", "rules", "decisions", "events", "seats"].map(async (k) => { S[k] = await load(k); }));
  return S;
}
const pub = (S) => ({ people: S.people, tasks: S.tasks, seats: S.seats, rules: S.rules, decisions: S.decisions, events: S.events });

const hashPw = async (pw, salt) => {
  const key = await CR.subtle.importKey("raw", enc.encode(String(pw)), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await CR.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(String(salt)), iterations: 100000, hash: "SHA-256" }, key, 256));
};
async function auth(req) {
  let pw = "";
  try { pw = (await config.get("ADMIN_PASSWORD")) || ""; } catch { pw = ""; }
  const given = hdr(req, "x-admin-password");
  const u = hdr(req, "x-user").trim().toLowerCase();
  if (!u) {
    if (pw && same(await sha(given), await sha(pw))) return { role: "owner", name: "Owner", scopes: ["*"] };
    return null;
  }
  const x = (await load("users")).find((v) => v.username === u);
  const salt = x?.salt || "00";
  const h = await hashPw(given, salt);
  if (x && x.hash && same(h, unhex(x.hash))) return { role: "user", id: x.id, name: x.name, scopes: x.scopes || [] };
  return null;
}

const lab = (o) => o.name || o.title || o.old || "";
const short = (v) => String(v ?? "").replace(/\s+/g, " ").slice(0, 40) || "∅";

function can(a, coll, o) {
  if (a.role === "owner") return true;
  const s = a.scopes;
  if (coll === "decisions") return s.includes("planner");
  if (coll === "events") return s.includes("events") || !!(o.branch && s.includes(o.branch));
  if (coll === "rules") return s.includes("hr") || !!(o.branch && s.includes(o.branch));
  if (coll === "tasks") return s.includes("hr") || !!(CB[o.target] && s.includes(CB[o.target]));
  if (coll === "people") return s.includes("hr") || [o.branch, CB[o.council], CB[o.division], COMM[o.committee]].some((b) => b && s.includes(b));
  return false;
}

// Applies one add/update/delete. Returns an error string, or a history entry ({} when nothing changed).
function change(S, a, coll, act, b, dirty) {
  const L = S[coll];
  if (!CLEAN[coll] || !L || !["add", "update", "delete"].includes(act)) return "op";
  if (act === "add") {
    if (L.length >= MAX[coll]) return "limit";
    const it = { ...DEF[coll], ...CLEAN[coll](b.item || b.person || b.task || {}), id: randomUUID(), created: Date.now() };
    if (!it[REQ[coll]]) return REQ[coll];
    if (!can(a, coll, it)) return "perm";
    L.push(it); dirty.add(coll);
    return { coll, op: "add", id: it.id, label: lab(it) };
  }
  const i = L.findIndex((x) => x.id === b.id);
  if (i < 0) return "missing";
  const before = L[i];
  if (!can(a, coll, before)) return "perm";
  if (act === "update") {
    const c = CLEAN[coll](b.patch || {});
    const after = { ...before, ...c };
    if (!can(a, coll, after)) return "perm";
    const f = Object.keys(c).filter((k) => String(c[k]) !== String(before[k] ?? ""));
    if (!f.length) return {};
    L[i] = after; dirty.add(coll);
    const bf = {};
    f.forEach((k) => { bf[k] = before[k] ?? ""; });
    return { coll, op: "update", id: before.id, label: lab(after), before: bf, sum: f.map((k) => `${k}: ${short(bf[k])} → ${short(c[k])}`).join("; ").slice(0, 300) };
  }
  L.splice(i, 1); dirty.add(coll);
  if (coll === "people") {
    // Work and seats that belonged to the removed person become unassigned.
    S.tasks = S.tasks.map((t) => (t.assignee === before.id ? { ...t, assignee: "" } : t)); dirty.add("tasks");
    for (const k in S.seats) if (S.seats[k] === before.id) delete S.seats[k];
    dirty.add("seats");
  }
  return { coll, op: "delete", id: before.id, label: lab(before), before };
}

async function handle(req) {
  // Anyone can read.
  if (req.method === "GET") return json(pub(await loadAll()));
  if (req.method !== "POST") return json({ error: "method" }, 405);

  // The owner password (ADMIN_PASSWORD) or a user login can write; permissions are checked per change.
  const a = await auth(req);
  if (!a) {
    await new Promise((r) => setTimeout(r, 700));
    return json({ error: "auth" }, 401);
  }
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
  if (!b || typeof b !== "object") return json({ error: "bad json" }, 400);

  const me = { role: a.role, name: a.name, scopes: a.scopes };
  const owner = a.role === "owner";
  const fail = (e) => json({ error: e }, e === "perm" ? 403 : 400);
  const logs = [];
  let H = null;
  const hist = async () => H || (H = await load("history"));
  const addLogs = async () => {
    if (!logs.length && !H) return;
    const h = await hist();
    logs.forEach((l) => h.push({ hid: randomUUID(), t: Date.now(), who: a.name, ...l }));
    await save("history", h.slice(-400));
  };
  const op = b.op;

  if (op === "history") {
    const h = await hist();
    return json({ history: h.slice(-200).reverse().map(({ before, ...x }) => x), me });
  }

  if (op === "users" || op === "userSave" || op === "userDel") {
    if (!owner) return fail("perm");
    let users = await load("users");
    if (op === "userSave") {
      const u = b.user || {};
      const name = String(u.name || "").trim().slice(0, 60), username = String(u.username || "").trim().toLowerCase();
      if (!name || !/^[a-z0-9_.-]{3,24}$/.test(username)) return fail("user");
      const scopes = (Array.isArray(u.scopes) ? u.scopes : []).filter((s) => SCOPES.includes(s));
      let x = u.id && users.find((v) => v.id === u.id);
      if (users.some((v) => v.username === username && v.id !== x?.id)) return fail("taken");
      const isNew = !x;
      if (isNew) {
        if (!u.password || String(u.password).length < 6) return fail("password");
        if (users.length >= 50) return fail("limit");
        x = { id: randomUUID(), created: Date.now() }; users.push(x);
      }
      Object.assign(x, { name, username, scopes });
      if (u.password) {
        if (String(u.password).length < 6) return fail("password");
        x.salt = randomHex(16); x.hash = hex(await hashPw(u.password, x.salt));
      }
      logs.push({ coll: "users", op: isNew ? "add" : "update", id: x.id, label: `${name} (${scopes.join(", ") || "no access"})` });
    } else if (op === "userDel") {
      const x = users.find((v) => v.id === b.id);
      if (!x) return fail("missing");
      users = users.filter((v) => v !== x);
      logs.push({ coll: "users", op: "delete", id: x.id, label: x.name });
    }
    if (op !== "users") { await save("users", users); await addLogs(); }
    return json({ users: users.map(({ salt, hash, ...r }) => r), me });
  }

  const S = await loadAll();
  const dirty = new Set();

  if (op === "check") {
    // Just confirms the login.
  } else if (op === "seat") {
    const m = /^(tf|pk|la):[a-z0-9]{2,12}$/.exec(String(b.key));
    if (!m) return fail("seat");
    if (!owner && !a.scopes.includes("hr") && !a.scopes.includes(m[1])) return fail("perm");
    const v = typeof b.personId === "string" && S.people.some((p) => p.id === b.personId) ? b.personId : "";
    const old = S.seats[b.key] || "";
    if (v !== old) {
      if (v) S.seats[b.key] = v; else delete S.seats[b.key];
      dirty.add("seats");
      logs.push({ coll: "seats", op: "update", id: b.key, label: S.people.find((p) => p.id === v)?.name || "Vacant", before: { v: old } });
    }
  } else if (op === "applyRules") {
    const nz = (x) => String(x || "").trim().toLowerCase();
    let n = 0;
    for (const p of S.people) {
      if (p.newRank || !p.rank) continue;
      const r = S.rules.find((r) => nz(r.old) === nz(p.rank) && r.newRank && (!p.branch || !r.branch || r.branch === p.branch));
      if (!r) continue;
      const np = { ...p, newRank: r.newRank, branch: p.branch || r.branch || "" };
      if (!can(a, "people", p) || !can(a, "people", np)) continue;
      Object.assign(p, np); n++;
    }
    if (n) { dirty.add("people"); logs.push({ coll: "people", op: "bulk", id: "", label: `Applied rank rules to ${n} ${n === 1 ? "person" : "people"}` }); }
  } else if (op === "revert") {
    if (!owner) return fail("perm");
    const h = await hist();
    const e = h.find((x) => x.hid === b.hid);
    if (!e || e.reverted || !["add", "update", "delete"].includes(e.op) || e.coll === "users") return fail("missing");
    if (e.coll === "seats") {
      const v = e.before?.v || "";
      if (v) S.seats[e.id] = v; else delete S.seats[e.id];
      dirty.add("seats");
    } else {
      const L = S[e.coll];
      const i = L ? L.findIndex((x) => x.id === e.id) : -1;
      if (!L) return fail("missing");
      if (e.op === "add") { if (i < 0) return fail("missing"); L.splice(i, 1); }
      else if (e.op === "update") { if (i < 0) return fail("missing"); L[i] = { ...L[i], ...e.before }; }
      else { if (i >= 0) return fail("missing"); L.push(e.before); }
      dirty.add(e.coll);
    }
    e.reverted = true;
    logs.push({ coll: e.coll, op: "revert", id: e.id, label: e.label });
  } else {
    const [coll, act] = b.coll ? [b.coll, op] : ALIAS[op] || [];
    const r = change(S, a, coll, act, b, dirty);
    if (typeof r === "string") return fail(r);
    if (r.coll) logs.push(r);
  }

  for (const k of dirty) await save(k, S[k]);
  await addLogs();
  return json({ ...pub(S), me });
}

export const access = "public"; // access is enforced inside handle() (owner password / user logins)
export const methods = ["GET", "POST"];

export default async function (req, res) {
  try {
    const { status, data } = await handle(req);
    res.setHeader?.("cache-control", "no-store");
    res.status(status).json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server" });
  }
}
