import { z } from "zod";
import { ADMIN_ACTOR, adminJson, guardAdmin } from "@/lib/admin-api";
import {
  AdminOpsError,
  readWithdrawalQueue,
  transitionWithdrawal,
  WITHDRAWAL_STATUSES,
} from "@/lib/admin-ops";
import { readJsonBody, RequestBodyTooLargeError } from "@/lib/http-body";
import type { WithdrawStatus } from "@/lib/game";
import { notifyWithdrawalStatus } from "@/lib/withdrawal-notifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2048;
const statusEnum = z.enum(
  WITHDRAWAL_STATUSES as unknown as [WithdrawStatus, ...WithdrawStatus[]],
);

const transitionSchema = z
  .object({
    id: z.string().regex(/^\d{1,19}$/),
    expectedStatus: statusEnum,
    nextStatus: statusEnum,
    note: z.string().trim().max(280).optional(),
  })
  .strict();

/**
 * `Number("abc")` itu NaN, dan NaN lolos setiap clamp `Math.min`/`Math.max` --
 * dulu ia menyelinap sampai ke klausa LIMIT dan membalas 500. Query yang cacat
 * harus dijawab 400.
 */
function wholeNumberParam(value: string | null, fallback: number) {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export async function GET(request: Request) {
  const denied = guardAdmin(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status") ?? "pending";
  const status =
    statusParam === "all"
      ? ("all" as const)
      : statusEnum.safeParse(statusParam).data;
  if (!status) {
    return adminJson({ error: "Status tidak dikenal." }, 400);
  }

  const limit = wholeNumberParam(url.searchParams.get("limit"), 25);
  const offset = wholeNumberParam(url.searchParams.get("offset"), 0);
  if (limit === null || offset === null) {
    return adminJson({ error: "Batas atau offset tidak valid." }, 400);
  }

  try {
    const page = await readWithdrawalQueue({ status, limit, offset });
    return adminJson(page);
  } catch (error) {
    if (error instanceof AdminOpsError) {
      return adminJson({ error: error.message }, error.status);
    }
    return adminJson({ error: "Antrean belum bisa dibaca." }, 500);
  }
}

export async function POST(request: Request) {
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

  const body = transitionSchema.safeParse(payload);
  if (!body.success) {
    return adminJson({ error: "Perubahan status tidak valid." }, 400);
  }

  try {
    const result = await transitionWithdrawal({
      ...body.data,
      actor: ADMIN_ACTOR,
    });
    if (result.to === "paid" || result.to === "rejected") {
      // Produksi memakai satu proses PM2 persisten, jadi Bot API bisa berjalan
      // setelah respons tanpa menahan operator hingga timeout Telegram.
      void notifyWithdrawalStatus({
        userId: result.userId,
        status: result.to,
        coins: result.coins,
        amountIdr: result.amountIdr,
      });
    }
    return adminJson(result);
  } catch (error) {
    if (error instanceof AdminOpsError) {
      return adminJson({ error: error.message }, error.status);
    }
    return adminJson({ error: "Perubahan belum bisa disimpan." }, 500);
  }
}
