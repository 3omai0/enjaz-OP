import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getShellState } from "@/lib/queries/shell";

/**
 * Cheap change check for live updates: one query, a short fingerprint back.
 * The browser polls it while someone is actively using the page and refreshes
 * only when the fingerprint changes.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const state = await getShellState(session.sub);
  if (state.sessionVersion === null || state.sessionVersion !== session.sv) {
    return NextResponse.json({ ok: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ ok: true, v: state.version }, { headers: { "Cache-Control": "no-store" } });
}
