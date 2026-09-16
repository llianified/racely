import { z } from "zod";
import { ADMIN_ACTOR, adminJson, guardAdmin } from "@/lib/admin-api";
import {
  AdminOpsError,
  MAX_ADMIN_BALANCE,
  readPlayerBalances,
  setPlayerBalance,
} from "@/lib/admin-ops";
import { readJsonBody, RequestBodyTooLargeError } from "@/lib/http-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1024;
const balanceSchema = z
  .object({
    userId: z.string().trim().min(1).max(128),
    expectedBalance: z.number().int().min(0).max(MAX_ADMIN_BALANCE),
    balance: z.number().int().min(0).max(MAX_ADMIN_BALANCE),
  })
  .strict();

function wholeNumberParam(value: string | null, fallback: number) {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export async function GET(request: Request) {
  const denied = guardAdmin(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  if (query.length > 80) {
    return adminJson({ error: "Pencarian terlalu panjang." }, 400);
  }
  const limit = wholeNumberParam(url.searchParams.get("limit"), 25);
  const offset = wholeNumberParam(url.searchParams.get("offset"), 0);
  if (limit === null || offset === null) {
    return adminJson({ error: "Batas atau offset tidak valid." }, 400);
  }

  try {
    return adminJson(await readPlayerBalances({ query, limit, offset }));
  } catch (error) {
    if (error instanceof AdminOpsError) {
      return adminJson({ error: error.message }, error.status);
    }
    return adminJson({ error: "Daftar user belum bisa dibaca." }, 500);
  }
}

export async function PATCH(request: Request) {
  const denied = guardAdmin(request, { mutating: true });
  if (denied) return denied;

  let payload: unknown;
  try {
    payload = await readJsonBody(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return adminJson({ error: "Permintaan terlalu besar." }, 413);
    }
    return adminJson({ error: "Isi permintaan tidak valid." }, 400);
  }

  const body = balanceSchema.safeParse(payload);
  if (!body.success) {
    return adminJson({ error: "Perubahan saldo tidak valid." }, 400);
  }

  try {
    return adminJson(
      await setPlayerBalance({ ...body.data, actor: ADMIN_ACTOR }),
    );
  } catch (error) {
    if (error instanceof AdminOpsError) {
      return adminJson({ error: error.message }, error.status);
    }
    return adminJson({ error: "Saldo belum bisa disimpan." }, 500);
  }
}
