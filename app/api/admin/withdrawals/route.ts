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

  try {
    const page = await readWithdrawalQueue({
      status,
      limit: Number(url.searchParams.get("limit") ?? 25),
      offset: Number(url.searchParams.get("offset") ?? 0),
    });
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
    return adminJson(result);
  } catch (error) {
    if (error instanceof AdminOpsError) {
      return adminJson({ error: error.message }, error.status);
    }
    return adminJson({ error: "Perubahan belum bisa disimpan." }, 500);
  }
}
