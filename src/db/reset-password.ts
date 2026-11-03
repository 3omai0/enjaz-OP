/**
 * Sets a new password for an account when nobody can sign in to reset it
 * from the team page (for example the only administrator forgot theirs).
 *
 *   npm run reset-password                  the only administrator, or asks which email
 *   npm run reset-password -- name@site.sa  that account
 *
 * It asks for the new password twice without showing it, signs the account
 * out on every device, and lifts any sign-in block left from wrong passwords
 * (versions of the app before 2026-09-29 blocked after five). It uses
 * the same database as the app (.env), so run it on a computer that has the
 * project's .env. In local (PGlite) mode stop the dev server first.
 */
import { config } from "dotenv";
import readline from "node:readline";

config({ path: ".env.local" });
config();

const CR = 13;
const LF = 10;
const CTRL_C = 3;
const BACKSPACE = 8;
const DELETE = 127;

/** Piped input (scripts and tests) is read line by line; a terminal is read key by key. */
const piped = !process.stdin.isTTY ? readline.createInterface({ input: process.stdin })[Symbol.asyncIterator]() : null;

/** Asks a question; a hidden answer shows a star per character. */
async function ask(question: string, hidden = false): Promise<string> {
  process.stdout.write(question);
  if (piped) {
    const { value } = await piped.next();
    process.stdout.write("\n");
    return String(value ?? "");
  }
  const stdin = process.stdin;
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let answer = "";
    const done = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write("\n");
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        const code = ch.charCodeAt(0);
        if (code === CR || code === LF) {
          done();
          resolve(answer);
          return;
        }
        if (code === CTRL_C) {
          done();
          reject(new Error("Cancelled, nothing was changed."));
          return;
        }
        if (code === BACKSPACE || code === DELETE) {
          if (answer.length > 0) {
            answer = answer.slice(0, -1);
            process.stdout.write("\b \b");
          }
          continue;
        }
        if (code < 32) continue;
        answer += ch;
        process.stdout.write(hidden ? "*" : ch);
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  // Imported after the environment is loaded so DATABASE_URL is seen.
  const { eq, sql } = await import("drizzle-orm");
  const { getDb, isNeon } = await import("./index");
  const { authAttempts, users } = await import("./schema");
  const { hashPassword } = await import("../lib/auth/password");

  const db = await getDb();
  console.log(isNeon ? "Database: Neon (the live site)." : `Database: local PGlite (${process.env.PGLITE_DIR?.trim() || ".data/pglite"}).`);

  let email = (process.argv[2] ?? "").trim().toLowerCase();
  if (!email) {
    const admins = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.role, "admin"));
    if (admins.length === 1) {
      email = admins[0].email.toLowerCase();
      console.log(`Administrator: ${email}`);
    } else {
      console.log(`Administrators: ${admins.map((a) => a.email).join(", ") || "none"}`);
      email = (await ask("Email of the account: ")).trim().toLowerCase();
    }
  }
  const [account] = await db
    .select({ id: users.id, email: users.email, isActive: users.isActive })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`);
  if (!account) throw new Error(`No account with the email ${email}. Nothing was changed.`);

  const password = await ask("New password (at least 8 characters): ", true);
  if (password.length < 8 || password.length > 128) throw new Error("The password must be 8 to 128 characters. Nothing was changed.");
  if ((await ask("Type it again: ", true)) !== password) throw new Error("The two passwords do not match. Nothing was changed.");

  // Signing out everywhere means a lost or shared device cannot keep using the old session.
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() })
    .where(eq(users.id, account.id));
  // Older versions blocked sign-in after repeated wrong passwords; emptying the table lifts any block still running.
  await db.delete(authAttempts);

  console.log(`Done: ${account.email} has a new password and can sign in now. Other devices were signed out.`);
  if (!account.isActive) console.log("Note: this account is deactivated. Sign in with another administrator to activate it, or it cannot sign in.");
}

main()
  .then(() => process.exit(0))
  .catch((err: Error) => {
    console.error(err.message || err);
    process.exit(1);
  });
