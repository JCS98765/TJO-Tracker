// GET /api/roblox?u=username -> { found, id, name, displayName, avatar }
// Browsers can't call Roblox directly (CORS), so this proxies two fixed Roblox endpoints.
export const access = "public";
export const methods = ["GET"];

export default async function (req, res) {
  let u = req.query?.u;
  if (u === undefined) { try { u = new URL(req.url, "http://x").searchParams.get("u"); } catch { u = ""; } }
  u = String(u || "").trim();
  if (!/^[A-Za-z0-9_]{3,20}$/.test(u)) return res.status(400).json({ error: "username" });
  try {
    const r = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ usernames: [u], excludeBannedUsers: false }),
    });
    if (!r.ok) return res.status(502).json({ error: "roblox" });
    const hit = ((await r.json()).data || [])[0];
    if (!hit) return res.status(200).json({ found: false });
    let avatar = "";
    try {
      const t = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${hit.id}&size=150x150&format=Png`);
      avatar = ((await t.json()).data || [])[0]?.imageUrl || "";
    } catch { /* avatar is optional */ }
    res.setHeader?.("cache-control", "public, max-age=300");
    return res.status(200).json({ found: true, id: hit.id, name: hit.name, displayName: hit.displayName, avatar });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: "roblox" });
  }
}
