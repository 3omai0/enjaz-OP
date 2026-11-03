import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (existsSync(".env")) {
  console.log(".env already exists; left unchanged.");
} else {
  const template = readFileSync(".env.example", "utf8")
    .replace(/^AUTH_SECRET=.*$/m, `AUTH_SECRET=${randomBytes(32).toString("hex")}`)
    .replace(/^CRON_SECRET=.*$/m, `CRON_SECRET=${randomBytes(32).toString("hex")}`);
  writeFileSync(".env", template, { flag: "wx", mode: 0o600 });
  console.log("Created .env with unique secrets. Run npm run dev and open http://localhost:3100/setup");
}
