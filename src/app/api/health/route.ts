import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isNeon } from "@/db";

/** Liveness check: confirms the app can reach its database and which one it is. */
export async function GET() {
  const database = isNeon ? "neon" : "pglite";
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return NextResponse.json({ ok: true, database });
  } catch (error) {
    // Details stay in the server log; the public answer never includes them.
    console.error("Health check failed", error);
    return NextResponse.json({ ok: false, database }, { status: 503 });
  }
}
