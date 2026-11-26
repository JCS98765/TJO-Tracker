// POST /api/roblox-group { usernames: [...] } -> { group, results: { <lowercase username>: {...} } }
// Looks up each username on Roblox and reports their role in the configured group (config: roblox_group_id).
// Only public Roblox data is returned; comparing it with the tracker happens in the browser.
import { config } from "hatchable";
export const access = "public";
export const methods = ["POST"];

export default async function (req, res) {
  try {
    const gid = Number(await config.get("roblox_group_id"));
    if (!gid) return res.status(400).json({ error: "no_group" });
    let b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
    const names = [...new Set((Array.isArray(b?.usernames) ? b.usernames : []).map((x) => String(x || "").trim()))]
      .filter((x) => /^[A-Za-z0-9_]{3,20}$/.test(x)).slice(0, 30);
    const out = {};
    if (!names.length) return res.status(200).json({ group: gid, results: out });

    const r = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ usernames: names, excludeBannedUsers: false }),
    });
    if (!r.ok) return res.status(502).json({ error: "roblox" });
    const found = new Map(((await r.json()).data || []).map((u) => [String(u.requestedUsername).toLowerCase(), u]));
    for (const n of names) if (!found.has(n.toLowerCase())) out[n.toLowerCase()] = { found: false };

    const todo = [...found.entries()];
    for (let i = 0; i < todo.length; i += 5) {
      await Promise.all(todo.slice(i, i + 5).map(async ([key, u]) => {
        try {
          const g = await fetch(`https://groups.roblox.com/v2/users/${u.id}/groups/roles?includeLocked=true`);
          if (!g.ok) { out[key] = { found: true, id: u.id, name: u.name, error: g.status === 429 ? "ratelimit" : "roblox" }; return; }
          const m = ((await g.json()).data || []).find((x) => x.group?.id === gid);
          out[key] = { found: true, id: u.id, name: u.name, inGroup: !!m, role: m?.role?.name || "", rank: m?.role?.rank ?? null };
        } catch { out[key] = { found: true, id: u.id, name: u.name, error: "roblox" }; }
      }));
    }
    res.setHeader?.("cache-control", "no-store");
    return res.status(200).json({ group: gid, results: out });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: "roblox" });
  }
}
