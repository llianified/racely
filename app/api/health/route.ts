import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  if (!pool) {
    return NextResponse.json(
      { status: "unhealthy", database: "unconfigured" },
      { status: 503, headers },
    );
  }

  try {
    await Promise.race([
      pool.query("SELECT 1"),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Health check timed out.")), 3_000),
      ),
    ]);
    return NextResponse.json(
      { status: "ok", database: "reachable" },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { status: "unhealthy", database: "unreachable" },
      { status: 503, headers },
    );
  }
}
