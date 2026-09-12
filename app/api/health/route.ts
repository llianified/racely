import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROBE_TIMEOUT_MS = 3_000;

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  if (!pool) {
    return NextResponse.json(
      { status: "unhealthy", database: "unconfigured" },
      { status: 503, headers },
    );
  }

  // The load balancer polls this constantly, so the loser of the race has to be
  // cleared: an uncleared 3s timer per probe keeps the event loop busy forever.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      pool.query("SELECT 1"),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Health check timed out.")),
          PROBE_TIMEOUT_MS,
        );
      }),
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
  } finally {
    clearTimeout(timer);
  }
}
