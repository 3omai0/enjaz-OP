import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });
config();

const url = process.env.DATABASE_URL;
const isPostgres = !!url && /^postgres(ql)?:\/\//.test(url);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  ...(isPostgres
    ? { dbCredentials: { url: url as string } }
    : { driver: "pglite", dbCredentials: { url: "./.data/pglite" } }),
  strict: true,
  verbose: true,
});
