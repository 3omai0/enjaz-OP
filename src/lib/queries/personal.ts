import { eq } from "drizzle-orm";
import { cache } from "react";
import { atomic, getDb } from "@/db";
import { labels, projectMembers, projects, type Project } from "@/db/schema";
import { isLang } from "@/lib/i18n";
import { dict } from "@/lib/i18n/dictionary";

/*
 * A person's personal space: a private project (projects.personalOwnerId)
 * that holds their own everyday tasks, such as study, the gym or homework. It
 * reuses the task engine (board, list, checklist, notes), while the access
 * layer keeps it visible to its owner alone and out of every team list.
 */

/** Colors of the starter categories, taken from the label palette. */
const STARTER_COLORS = ["#0e7490", "#15803d", "#8554eb", "#b45309", "#be185d"];
const KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Every project needs a unique key; nobody sees this one (personal tasks show #12). */
function personalKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(7));
  return `P${[...bytes].map((b) => KEY_ALPHABET[b % KEY_ALPHABET.length]).join("")}`;
}

/**
 * The person's personal space, created on first use together with a few
 * starter categories in their language. Two tabs opening it at once still end
 * up with one space (the database allows one per person). Cached per request.
 */
export const getPersonalProject = cache(async (userId: string, locale: string): Promise<Project> => {
  const db = await getDb();
  const find = () => db.query.projects.findFirst({ where: eq(projects.personalOwnerId, userId) });
  const existing = await find();
  if (existing) return existing;

  const lang = isLang(locale) ? locale : "ar";
  const starters = dict.personal.starterCategories[lang];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const id = crypto.randomUUID();
    try {
      await atomic((q) => [
        q.insert(projects).values({ id, name: dict.personal.title[lang], key: personalKey(), ownerId: userId, personalOwnerId: userId, requireApproval: false, taskVisibility: "assigned" }),
        q.insert(projectMembers).values({ projectId: id, userId, role: "lead" }),
        q.insert(labels).values(starters.map((name, i) => ({ projectId: id, name, color: STARTER_COLORS[i % STARTER_COLORS.length] }))),
      ]);
      break;
    } catch (err) {
      // Another request created it first, or (rarely) the key was taken: use it, or try a new key.
      if (await find()) break;
      if (attempt === 3) throw err;
    }
  }
  const created = await find();
  if (!created) throw new Error("The personal space could not be created.");
  return created;
});
