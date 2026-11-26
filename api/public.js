// GET /api/public -> sanitized roster + upcoming events for the public page.
// Deliberately leaves out notes, status, decisions, hosts, Roblox names and anyone marked "purge".
import { db } from "hatchable";
export const access = "public";
export const methods = ["GET"];

const CN = {
  "Council of Reconciliation": "Jedi Task Force", "Council of Reassignment": "Jedi Peacekeepers", "Council of First Knowledge": "Librarians Assembly",
  "Librarian's Assembly": "Librarians Assembly", "Librarian’s Assembly": "Librarians Assembly",
};
const DN = { "Jedi Task Force": "Jedi Assault Team", "Jedi Librarians": "Jedi Shadows", Librarians: "Jedi Shadows" };
const get = async (n) => {
  const { rows } = await db.query("SELECT data FROM kv WHERE name = $1", [n]);
  const a = rows[0]?.data?.[n];
  return Array.isArray(a) ? a : [];
};

export default async function (req, res) {
  try {
    const [p, e] = await Promise.all([get("people"), get("events")]);
    const today = new Date().toISOString().slice(0, 10);
    const people = p.filter((x) => x.name && x.decision !== "purge").map((x) => ({
      name: x.name, rank: x.newRank || x.rank || "", hr: x.section === "hr",
      council: CN[x.council] || x.council || "", division: DN[x.division] || x.division || "",
    }));
    const events = e.filter((x) => x.title && x.status !== "cancelled" && (x.date || "") >= today)
      .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")))
      .slice(0, 20).map((x) => ({ title: x.title, details: x.details || "", date: x.date || "", time: x.time || "", type: x.type || "", host: x.host || "" }));
    res.setHeader?.("cache-control", "public, max-age=60");
    res.status(200).json({ people, events });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server" });
  }
}
