import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminAudit, players, withdrawals } from "@/lib/db/schema";
import type { WithdrawStatus } from "@/lib/game";

/**
 * Operasi panel admin atas antrean penarikan.
 *
 * Antreannya TETAP manual -- itu aturan keras di AGENTS.md. Yang ditambahkan di
 * sini hanyalah layar untuk pekerjaan yang sebelumnya dilakukan dengan
 * `UPDATE ... SET status` langsung lewat psql. Tidak ada integrasi pembayaran,
 * tidak ada transfer otomatis, dan tidak ada jalur yang memindahkan penarikan
 * tanpa seorang manusia menekan tombolnya.
 */

export const WITHDRAWAL_STATUSES: readonly WithdrawStatus[] = [
  "pending",
  "processing",
  "paid",
  "rejected",
];

/**
 * Perpindahan status yang diizinkan. Dua hal yang TIDAK ada di tabel ini, dan
 * alasannya:
 *
 * - `paid` tidak punya tujuan mana pun. Migrasi 0008 menuliskannya: menandai
 *   penarikan yang sudah dibayar sebagai 'rejected' akan mengembalikan koin yang
 *   uangnya sudah keluar dari rekening. `paid` adalah akhir.
 * - `rejected` juga akhir. Koinnya dikembalikan ke saldo pemain pada sync
 *   berikutnya (`refundRejectedWithdrawals`), jadi menghidupkannya kembali
 *   berarti membayar koin yang sudah dipulangkan.
 */
const ALLOWED_TRANSITIONS: Record<WithdrawStatus, readonly WithdrawStatus[]> = {
  pending: ["processing", "paid", "rejected"],
  processing: ["paid", "rejected"],
  paid: [],
  rejected: [],
};

export class AdminOpsError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
    this.name = "AdminOpsError";
  }
}

function getDatabase() {
  if (!db) throw new AdminOpsError("DATABASE_URL belum dikonfigurasi.", 503);
  return db;
}

export type QueueRow = {
  id: string;
  userId: string;
  username: string | null;
  displayName: string;
  coins: number;
  amountIdr: number;
  method: string;
  account: string;
  accountName: string;
  status: WithdrawStatus;
  createdAt: string;
  processedAt: string | null;
  refundedAt: string | null;
  /** Saldo pemain sekarang -- konteks untuk menilai permintaan yang aneh. */
  playerBalance: number;
  playerLaps: number;
  /** Berapa penarikan yang sudah pernah dibayar ke pemain ini. */
  paidBefore: number;
};

export type QueuePage = {
  rows: QueueRow[];
  total: number;
  limit: number;
  offset: number;
};

const MAX_LIMIT = 100;

export async function readWithdrawalQueue(options: {
  status?: WithdrawStatus | "all";
  limit?: number;
  offset?: number;
}): Promise<QueuePage> {
  const database = getDatabase();
  // `Math.min`/`Math.max` meneruskan NaN apa adanya, jadi clamp saja tidak cukup
  // untuk menahan angka cacat sampai ke LIMIT/OFFSET.
  const whole = (value: number | undefined, fallback: number) =>
    Number.isFinite(value) ? Math.floor(value as number) : fallback;
  const limit = Math.min(Math.max(1, whole(options.limit, 25)), MAX_LIMIT);
  const offset = Math.max(0, whole(options.offset, 0));
  const status = options.status ?? "pending";
  const filter =
    status === "all" ? undefined : eq(withdrawals.status, status);

  const [{ total }] = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(withdrawals)
    .where(filter);

  const rows = await database
    .select({
      id: withdrawals.id,
      userId: withdrawals.userId,
      coins: withdrawals.coins,
      amountIdr: withdrawals.amountIdr,
      method: withdrawals.method,
      account: withdrawals.account,
      accountName: withdrawals.accountName,
      status: withdrawals.status,
      createdAt: withdrawals.createdAt,
      processedAt: withdrawals.processedAt,
      refundedAt: withdrawals.refundedAt,
      username: players.telegramUsername,
      displayName: players.displayName,
      playerBalance: players.balance,
      playerLaps: players.laps,
      paidBefore: sql<number>`(
        select count(*)::int from racely_withdrawals prior
        where prior.user_id = ${withdrawals.userId}
          and prior.status = 'paid'
      )`,
    })
    .from(withdrawals)
    .innerJoin(players, eq(players.userId, withdrawals.userId))
    .where(filter)
    .orderBy(desc(withdrawals.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    total: Number(total ?? 0),
    limit,
    offset,
    rows: rows.map((row) => ({
      ...row,
      id: String(row.id),
      status: row.status as WithdrawStatus,
      createdAt: row.createdAt.toISOString(),
      processedAt: row.processedAt?.toISOString() ?? null,
      refundedAt: row.refundedAt?.toISOString() ?? null,
      paidBefore: Number(row.paidBefore ?? 0),
    })),
  };
}

export function transitionAllowed(from: WithdrawStatus, to: WithdrawStatus) {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export type TransitionResult = {
  id: string;
  from: WithdrawStatus;
  to: WithdrawStatus;
  coins: number;
  amountIdr: number;
  userId: string;
};

/**
 * Memindahkan satu penarikan. `WHERE status = <yang dibaca operator>` adalah
 * seluruh penjaga konkurensinya: dua tab yang menekan tombol bersamaan membuat
 * yang kedua tidak mengembalikan baris apa pun, bukan menerapkan perpindahan
 * dua kali. `refunded_at IS NULL` menahan baris yang koinnya sudah dipulangkan.
 */
export async function transitionWithdrawal(input: {
  id: string;
  expectedStatus: WithdrawStatus;
  nextStatus: WithdrawStatus;
  actor: string;
  note?: string;
  now?: Date;
}): Promise<TransitionResult> {
  const database = getDatabase();
  const now = input.now ?? new Date();
  const id = Number(input.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AdminOpsError("Id penarikan tidak valid.", 400);
  }
  if (!transitionAllowed(input.expectedStatus, input.nextStatus)) {
    throw new AdminOpsError(
      `Perpindahan ${input.expectedStatus} → ${input.nextStatus} tidak diizinkan.`,
      422,
    );
  }

  const terminal =
    input.nextStatus === "paid" || input.nextStatus === "rejected";
  const [updated] = await database
    .update(withdrawals)
    .set({
      status: input.nextStatus,
      processedAt: terminal ? now : null,
    })
    .where(
      and(
        eq(withdrawals.id, id),
        eq(withdrawals.status, input.expectedStatus),
        isNull(withdrawals.refundedAt),
      ),
    )
    .returning({
      id: withdrawals.id,
      userId: withdrawals.userId,
      coins: withdrawals.coins,
      amountIdr: withdrawals.amountIdr,
    });

  if (!updated) {
    throw new AdminOpsError(
      "Penarikan sudah berubah statusnya. Muat ulang antrean lalu coba lagi.",
    );
  }

  await recordAudit({
    actor: input.actor,
    action: `withdrawal:${input.nextStatus}`,
    target: String(updated.id),
    detail: {
      from: input.expectedStatus,
      to: input.nextStatus,
      coins: updated.coins,
      amountIdr: updated.amountIdr,
      userId: updated.userId,
      ...(input.note ? { note: input.note } : {}),
    },
  });

  return {
    id: String(updated.id),
    from: input.expectedStatus,
    to: input.nextStatus,
    coins: updated.coins,
    amountIdr: updated.amountIdr,
    userId: updated.userId,
  };
}

export async function recordAudit(entry: {
  actor: string;
  action: string;
  target?: string | null;
  detail?: Record<string, unknown>;
}) {
  if (!db) return;
  // Audit tidak boleh menjatuhkan operasi yang sudah berhasil tertulis.
  await db
    .insert(adminAudit)
    .values({
      actor: entry.actor,
      action: entry.action,
      target: entry.target ?? null,
      detail: entry.detail ?? null,
    })
    .catch(() => undefined);
}

export type AuditRow = {
  id: string;
  actor: string;
  action: string;
  target: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

export async function readAuditTrail(limit = 30): Promise<AuditRow[]> {
  const database = getDatabase();
  const rows = await database
    .select()
    .from(adminAudit)
    .orderBy(desc(adminAudit.createdAt))
    .limit(Math.min(Math.max(1, limit), MAX_LIMIT));
  return rows.map((row) => ({
    id: String(row.id),
    actor: row.actor,
    action: row.action,
    target: row.target,
    detail: row.detail ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export type LiabilitySnapshot = {
  players: number;
  activePlayers: number;
  /** Koin yang sudah bisa ditarik pemain sekarang. */
  balanceCoins: number;
  /** Koin yang masih menumpuk dan belum diklaim ke saldo. */
  pendingCoins: number;
  /** Seluruh koin yang pernah dicetak dari balapan. */
  earnedCoins: number;
  byStatus: Record<WithdrawStatus, { count: number; coins: number }>;
  /** Permintaan 7 hari terakhir -- laju antrean masuk. */
  requestedLast7Days: number;
};

/**
 * Angka yang tidak pernah bisa dibaca dari config: berapa rupiah yang sudah
 * dijanjikan Racely. Setiap koin di saldo pemain adalah kewajiban yang menunggu
 * penarikan, dan tanpa layar ini satu-satunya cara melihatnya adalah psql.
 */
export async function readLiability(): Promise<LiabilitySnapshot> {
  const database = getDatabase();

  const [totals] = await database
    .select({
      players: sql<number>`count(*)::int`,
      activePlayers: sql<number>`count(*) filter (where car_model is not null)::int`,
      balanceCoins: sql<number>`coalesce(sum(balance), 0)::float8`,
      pendingCoins: sql<number>`coalesce(sum(pending), 0)::float8`,
      earnedCoins: sql<number>`coalesce(sum(earned), 0)::float8`,
    })
    .from(players);

  const statusRows = await database
    .select({
      status: withdrawals.status,
      count: sql<number>`count(*)::int`,
      coins: sql<number>`coalesce(sum(coins), 0)::float8`,
    })
    .from(withdrawals)
    .groupBy(withdrawals.status);

  const [recent] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(withdrawals)
    .where(sql`${withdrawals.createdAt} > now() - interval '7 days'`);

  const byStatus = WITHDRAWAL_STATUSES.reduce(
    (acc, status) => {
      acc[status] = { count: 0, coins: 0 };
      return acc;
    },
    {} as LiabilitySnapshot["byStatus"],
  );
  for (const row of statusRows) {
    const status = row.status as WithdrawStatus;
    if (byStatus[status]) {
      byStatus[status] = {
        count: Number(row.count ?? 0),
        coins: Number(row.coins ?? 0),
      };
    }
  }

  return {
    players: Number(totals?.players ?? 0),
    activePlayers: Number(totals?.activePlayers ?? 0),
    balanceCoins: Number(totals?.balanceCoins ?? 0),
    pendingCoins: Number(totals?.pendingCoins ?? 0),
    earnedCoins: Number(totals?.earnedCoins ?? 0),
    byStatus,
    requestedLast7Days: Number(recent?.count ?? 0),
  };
}
