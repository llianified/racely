import "server-only";
import { DAILY_MISSION_KINDS, dailyMissionsFor, settleDailyMissions, claimDailyMission } from "./daily-missions";
import { GEAR_IDS, ROLLER_IDS, knownCarSetup } from "./car-setup";
import { PAINT_IDS, applyPaintCommand, ownedPaintsSchema, type PaintCommand } from "./car-paints";

import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  actionReceipts,
  players,
  rewardClaims,
  withdrawals,
  type PlayerRow,
  type WithdrawalRow,
} from "@/lib/db/schema";
import {
  adClaimKey,
  adClaimRange,
  adRewardStatus,
  calculateRaceSettlement,
  DAILY_CLAIM_END,
  DAILY_CLAIM_PREFIX,
  DAILY_HISTORY_DAYS,
  dailyCheckIn,
  racingDayKey,
} from "@/lib/game-economy";
import { CAR_MODEL_IDS, isCarColor, type CarModelId } from "@/lib/car-catalog";
import {
  applyPartCommand,
  bodyPartsSchema,
  emptyBodyParts,
  PART_IDS,
  PART_SLOTS,
  PartRuleError,
  type PartCommand,
} from "@/lib/car-parts";
import {
  accountPattern,
  MISSION_IDS,
  missions,
  missionValue,
  REFERRAL_PARAM_PREFIX,
  roundCoins,
  WITHDRAW_METHODS,
  type AdReward,
  type DailyCheckIn,
  type GameState,
  type ReferralSummary,
  type OfflineEarnings,
  type Upgrade,
  type WithdrawalRecord,
  type WithdrawMethod,
  type WithdrawStatus,
} from "@/lib/game";
import {
  UPGRADE_KEYS,
  circuitUnlockLaps,
  coinsToIdr,
  upgradeCostAt,
  type EconomyConfig,
} from "@/lib/economy-config";
import { LAST_CIRCUIT } from "@/lib/track-layout";
import { readEconomyConfig } from "@/lib/economy-store";
import type { PlayerIdentity } from "@/lib/telegram-auth";
import { referralLink } from "@/lib/telegram-bot";
import { proxiedAvatarPath } from "@/lib/telegram-avatar";

const carColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);
const METHOD_IDS = WITHDRAW_METHODS.map((method) => method.id) as [
  WithdrawMethod,
  ...WithdrawMethod[],
];
const HISTORY_LIMIT = 8;
const INVITER_CLAIM_PREFIX = "ref-referrer:";
const INVITER_CLAIM_END = "ref-referrer;";
const INVITEE_CLAIM_PREFIX = "ref-referee:";
/**
 * Receipts only have to outlive a client retry, which happens within seconds.
 * Keep a generous window and prune probabilistically, like the Telegram update
 * table, so the row count stays bounded without a scheduled job.
 */
const RECEIPT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const RECEIPT_PRUNE_PROBABILITY = 0.02;

const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("daily-mission"), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), kind: z.enum(DAILY_MISSION_KINDS) }).strict(),
  z.object({ type: z.literal("buy-paint"), paintId: z.enum(PAINT_IDS) }).strict(),
  z.object({ type: z.literal("equip-paint"), paintId: z.enum(PAINT_IDS) }).strict(),
  z.object({ type: z.literal("buy-part"), partId: z.enum(PART_IDS) }).strict(),
  z.object({ type: z.literal("equip-part"), partId: z.enum(PART_IDS) }).strict(),
  z.object({ type: z.literal("unequip-part"), slot: z.enum(PART_SLOTS) }).strict(),
  z.object({ type: z.literal("sync") }).strict(),
  z
    .object({
      type: z.literal("set-setup"),
      gear: z.enum(GEAR_IDS),
      roller: z.enum(ROLLER_IDS),
    })
    .strict(),
  z
    .object({
      type: z.literal("upgrade"),
      key: z.enum(UPGRADE_KEYS as unknown as [Upgrade, ...Upgrade[]]),
    })
    .strict(),
  z.object({ type: z.literal("claim") }).strict(),
  z.object({ type: z.literal("boost") }).strict(),
  z.object({ type: z.literal("gift") }).strict(),
  z.object({ type: z.literal("daily") }).strict(),
  z.object({ type: z.literal("watch-ad") }).strict(),
  z
    .object({
      type: z.literal("mission"),
      id: z.enum(MISSION_IDS),
    })
    .strict(),
  z
    .object({
      type: z.literal("select-car"),
      model: z.enum(CAR_MODEL_IDS),
      color: carColorSchema,
    })
    .strict(),
  z
    .object({ type: z.literal("color"), color: carColorSchema })
    .strict(),
  z
    .object({
      type: z.literal("circuit"),
      circuit: z.number().int().min(0).max(LAST_CIRCUIT),
    })
    .strict(),
  z
    .object({
      type: z.literal("withdraw"),
      method: z.enum(METHOD_IDS),
      account: z.string().trim().regex(/^\d{8,18}$/),
      accountName: z.string().trim().min(2).max(60),
      /**
       * Pagar mutlak, bukan aturan bisnisnya. Skema ini dibangun sekali saat
       * modul dimuat, sedangkan batas penarikan bisa berubah kapan saja dari
       * panel admin -- jadi `minWithdrawCoins` dan `maxWithdrawCoins` ditegakkan
       * di `performGameAction`, tempat config tersedia. Di sini cukup menolak
       * angka yang tidak masuk akal bagi tipe kolomnya.
       */
      coins: z.number().int().min(1).max(1_000_000_000),
    })
    .strict(),
]);

export const gameActionSchema = z
  .object({
    requestId: z.string().uuid(),
    action: commandSchema,
  })
  .strict();

export type GameCommand = z.infer<typeof commandSchema>;

export class GameRuleError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
    this.name = "GameRuleError";
  }
}

function getDatabase() {
  if (!db) throw new Error("DATABASE_URL is not configured");
  return db;
}

function withdrawalRecord(row: WithdrawalRow): WithdrawalRecord {
  return {
    id: String(row.id),
    coins: row.coins,
    method: row.method as WithdrawMethod,
    account: row.account,
    accountName: row.accountName,
    status: row.status as WithdrawStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Apakah baris ini milik pemain yang sudah berjalan sebelum pemilihan mobil ada.
 *
 * Dulu pertanyaannya dijawab dengan `row.balance !== economy.startingBalance`.
 * Itu ikut berubah ketika `startingBalance` disetel dari panel: menaikkannya
 * membuat SETIAP pemain baru -- yang saldonya masih nilai lama -- ditandai
 * sebagai pemain lama. `version` tidak punya masalah itu: ia mulai dari 1 dan
 * naik pada setiap aksi non-sync, jadi `> 1` berarti pemain ini pernah benar-
 * benar melakukan sesuatu, berapa pun saldo awal yang berlaku hari ini.
 */
function hasExistingProgress(row: PlayerRow, history: WithdrawalRow[]) {
  return (
    row.version > 1 ||
    row.pending > 0 ||
    row.earned > 0 ||
    row.laps > 0 ||
    row.engineLevel > 1 ||
    row.tiresLevel > 1 ||
    row.batteryLevel > 1 ||
    row.rewardClaimed ||
    row.missionsClaimed.length > 0 ||
    history.length > 0
  );
}

/**
 * `car_model` dan `body_parts` masuk dari database sebagai CAST, bukan hasil
 * validasi: `$type<CarModelId>()` dan `$type<BodyParts>()` hanya berjanji kepada
 * TypeScript, tidak memeriksa apa pun saat berjalan. Satu baris yang isinya di
 * luar dugaan karena itu mengalir utuh sampai ke komponen, dan garasi membaca
 * `CAR_CATALOG[model].colors` tanpa jaring: model tak dikenal = `undefined.colors`
 * = seluruh app tumbang. Persis itu yang terjadi di produksi dengan satu baris
 * ber-`car_model` 'ufo-gabut'.
 *
 * CHECK constraint di `0001` memang ada, tapi ia bukan jaminan yang cukup: rute
 * "mobil baru" di AGENTS.md punya empat langkah terpisah, dan menambah id ke
 * daftar SQL sebelum katalognya berarti database sah-sah saja menyimpan model
 * yang belum bisa dirender kode.
 *
 * Model yang tidak dikenal karena itu dinormalkan menjadi null -- bentuk yang
 * SUDAH ditangani app sebagai "belum pilih mobil", jadi pemainnya diantar ke
 * layar pemilihan mobil (warnanya tetap) alih-alih menatap layar error.
 */
export function knownCarModel(model: string | null): CarModelId | null {
  return model !== null && (CAR_MODEL_IDS as readonly string[]).includes(model)
    ? (model as CarModelId)
    : null;
}

/** Alasan yang sama; `PART_CATALOG[id].name` melempar untuk part tak dikenal. */
export function knownBodyParts(parts: unknown) {
  const validated = bodyPartsSchema.safeParse(parts);
  return validated.success ? validated.data : emptyBodyParts();
}

function stateFromRow(
  row: PlayerRow,
  now: Date,
  economy: EconomyConfig,
  history: WithdrawalRow[] = [],
  offlineEarnings: OfflineEarnings | null = null,
  daily: DailyCheckIn = dailyCheckIn([], now, economy),
  referral: ReferralSummary = {
    link: referralLink(row.userId),
    invited: 0,
    earned: 0,
  },
  adReward: AdReward = adRewardStatus(0, economy),
): GameState {
  const carModel = knownCarModel(row.carModel);
  return {
    developmentPreview: false,
    economy,
    adReward,
    bodyParts: knownBodyParts(row.bodyParts),
    setup: knownCarSetup(row.setup),
    dailyMissions: dailyMissionsFor(row.dailyMissions, now, economy),
    ownedPaints: ownedPaintsSchema.safeParse(row.ownedPaints).data ?? [],
    // Left off the payload entirely when there is nothing to report, so the
    // client can treat its presence as "show the welcome-back dialog".
    offlineEarnings: offlineEarnings ?? undefined,
    carSelection: {
      model: carModel,
      returningPlayer: carModel === null && hasExistingProgress(row, history),
    },
    withdrawals: history.map(withdrawalRecord),
    daily,
    referral,
    balance: row.balance,
    pending: row.pending,
    earned: row.earned,
    laps: row.laps,
    progress: row.progress,
    levels: {
      engine: row.engineLevel,
      tires: row.tiresLevel,
      battery: row.batteryLevel,
    },
    boostLeft: 0,
    cooldown: 0,
    rewardClaimed: row.rewardClaimed,
    missionsClaimed: row.missionsClaimed,
    color: row.color,
    circuit: row.circuit,
    player: {
      name: row.displayName,
      username: row.telegramUsername,
      // Disajikan ulang dari origin sendiri: menautkan t.me langsung membuat
      // CSP ikut memeriksa host CDN tujuan redirectnya. Lihat
      // `lib/telegram-avatar.ts`.
      photoUrl: proxiedAvatarPath(row.photoUrl),
    },
  };
}

/**
 * Riwayat check-in dibaca sebanyak DAILY_HISTORY_DAYS hari; streak yang lebih
 * panjang dari itu berhenti bertambah di tampilan, tapi hadiahnya sudah mentok
 * jauh sebelumnya jadi tidak ada koin yang hilang.
 */
type Transaction = Parameters<
  Parameters<NonNullable<typeof db>["transaction"]>[0]
>[0];

async function readDailyClaims(tx: Transaction, userId: string) {
  const rows = await tx
    .select({ rewardKey: rewardClaims.rewardKey })
    .from(rewardClaims)
    .where(
      and(
        eq(rewardClaims.userId, userId),
        gte(rewardClaims.rewardKey, DAILY_CLAIM_PREFIX),
        lt(rewardClaims.rewardKey, DAILY_CLAIM_END),
      ),
    )
    .orderBy(desc(rewardClaims.rewardKey))
    .limit(DAILY_HISTORY_DAYS);
  return rows.map((row) => row.rewardKey.slice(DAILY_CLAIM_PREFIX.length));
}

/** Berapa iklan berhadiah yang sudah dibayar hari balapan ini. */
async function readAdWatchesToday(tx: Transaction, userId: string, now: Date) {
  const range = adClaimRange(racingDayKey(now));
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(rewardClaims)
    .where(
      and(
        eq(rewardClaims.userId, userId),
        gte(rewardClaims.rewardKey, range.start),
        lt(rewardClaims.rewardKey, range.end),
      ),
    );
  return row?.count ?? 0;
}


/**
 * Ikatan referral hanya boleh terjadi sebelum putaran pertama. Setelah pemain
 * benar-benar bermain, tidak ada lagi yang bisa mengklaim telah mengajaknya.
 */
async function bindReferrer(
  tx: Transaction,
  row: PlayerRow,
  startParam: string | null,
): Promise<PlayerRow> {
  if (row.referredBy !== null || row.laps > 0) return row;
  if (!startParam?.startsWith(REFERRAL_PARAM_PREFIX)) return row;

  const inviterId = startParam.slice(REFERRAL_PARAM_PREFIX.length);
  if (!inviterId || inviterId === row.userId) return row;

  const [inviter] = await tx
    .select({ userId: players.userId })
    .from(players)
    .where(eq(players.userId, inviterId))
    .limit(1);
  if (!inviter) return row;

  const [bound] = await tx
    .update(players)
    .set({ referredBy: inviterId })
    .where(and(eq(players.userId, row.userId), isNull(players.referredBy)))
    .returning();
  return bound ?? row;
}

/** Sisi yang diajak dibayar di transaksinya sendiri -- barisnya sudah terkunci. */
async function payInviteeMilestone(
  tx: Transaction,
  row: PlayerRow,
  economy: EconomyConfig,
): Promise<PlayerRow> {
  if (!row.referredBy || row.laps < economy.referralMilestoneLaps) return row;
  const inserted = await tx
    .insert(rewardClaims)
    .values({
      userId: row.userId,
      rewardKey: `${INVITEE_CLAIM_PREFIX}${row.userId}`,
      amount: economy.referralRewardInvitee,
    })
    .onConflictDoNothing()
    .returning({ id: rewardClaims.id });
  return inserted.length > 0
    ? { ...row, balance: row.balance + economy.referralRewardInvitee }
    : row;
}

/**
 * Sisi pengajak dibayar SETELAH transaksi pemain yang diajak selesai, supaya
 * transaksi aksi pemain tidak ikut menahan baris orang lain.
 *
 * Transaksi ini sendiri tetap menyentuh DUA baris racely_players: saldo si
 * pengajak dan `referral_paid_at` si diajak. A mengajak B sementara B mengajak A
 * itu mungkin (`bindReferrer` hanya menolak mengajak diri sendiri), jadi dua
 * pembayaran yang berjalan bersamaan bisa mengunci pasangan yang sama dari dua
 * arah berlawanan -- siklus deadlock yang klasik.
 *
 * Karena itu kedua baris dikunci DI DEPAN, berurutan menurut user_id. Urutan
 * penguncian yang sama untuk semua transaksi berarti siklusnya tidak bisa
 * terbentuk sama sekali. Dua pernyataan terpisah, bukan satu `IN (...)`:
 * Postgres mengunci baris sesuai urutan produksi plan, dan itu bukan sesuatu
 * yang dijanjikan klausa ORDER BY.
 *
 * `referral_paid_at` tetap jadi jaring pengamannya: gagal berarti dicoba lagi
 * pada sync berikutnya, berhasil berarti berhenti.
 */
async function payInviter(row: PlayerRow, economy: EconomyConfig) {
  if (!row.referredBy) return;
  if (row.laps < economy.referralMilestoneLaps || row.referralPaidAt) return;

  const inviterId = row.referredBy;
  await getDatabase()
    .transaction(async (tx) => {
      for (const userId of [inviterId, row.userId].sort()) {
        await tx
          .select({ userId: players.userId })
          .from(players)
          .where(eq(players.userId, userId))
          .for("update");
      }

      const [inviter] = await tx
        .select({ userId: players.userId })
        .from(players)
        .where(eq(players.userId, inviterId))
        .limit(1);

      // Pengajak yang barisnya sudah hilang tidak berutang apa pun; tandai
      // lunas supaya tidak dicoba ulang tiap sync selamanya.
      if (inviter) {
        const inserted = await tx
          .insert(rewardClaims)
          .values({
            userId: inviterId,
            rewardKey: `${INVITER_CLAIM_PREFIX}${row.userId}`,
            amount: economy.referralRewardInviter,
          })
          .onConflictDoNothing()
          .returning({ id: rewardClaims.id });
        if (inserted.length > 0) {
          await tx
            .update(players)
            .set({
              balance: sql`${players.balance} + ${economy.referralRewardInviter}`,
            })
            .where(eq(players.userId, inviterId));
        }
      }

      await tx
        .update(players)
        .set({ referralPaidAt: new Date() })
        .where(eq(players.userId, row.userId));
    })
    .catch(() => undefined);
}

/**
 * Penarikan yang ditolak operator mengembalikan koinnya ke saldo. Saldo dipotong
 * saat permintaan dibuat, jadi tanpa ini 'rejected' menghanguskan koin pemain
 * diam-diam -- tidak ada kode yang mengembalikannya dan tidak ada satu kalimat
 * pun yang memberitahukannya.
 *
 * Ini BUKAN pelonggaran aturan antrean manual: tidak ada rupiah yang berpindah,
 * status penarikan tidak pernah disentuh, dan tidak ada penarikan yang bisa maju
 * menuju 'paid' dari sini. Satu-satunya tulisan balik adalah stempel
 * `refunded_at`, dan `IS NULL` pada klausa WHERE adalah seluruh penjaganya:
 * RETURNING hanya menyerahkan baris yang benar-benar ditandai oleh pernyataan
 * ini, jadi dua permintaan bersamaan tidak bisa membayar dua kali.
 *
 * Mode preview tidak punya pasangannya karena penarikan di dalam cookie selalu
 * 'pending' -- tidak ada operator yang bisa menolaknya di sana.
 */
async function refundRejectedWithdrawals(
  tx: Transaction,
  row: PlayerRow,
  now: Date,
): Promise<PlayerRow> {
  const refunded = await tx
    .update(withdrawals)
    .set({ refundedAt: now })
    .where(
      and(
        eq(withdrawals.userId, row.userId),
        eq(withdrawals.status, "rejected"),
        isNull(withdrawals.refundedAt),
      ),
    )
    .returning({ coins: withdrawals.coins });

  if (refunded.length === 0) return row;
  const total = refunded.reduce((sum, item) => sum + item.coins, 0);
  return { ...row, balance: row.balance + total };
}

/**
 * Satu perjalanan: berapa yang diajak, dan berapa koin ajakan yang sudah masuk.
 *
 * `earned` DIJUMLAHKAN dari `amount` yang tercatat, bukan dihitung ulang sebagai
 * "jumlah ajakan x tarif hari ini". Tarifnya disetel operator lewat /admin, jadi
 * rumus itu menulis ulang sejarah: menaikkan hadiah dari 5 ke 10 koin membuat
 * panel mengklaim pemain sudah menerima 10 koin untuk ajakan yang dibayar 5 --
 * angka yang tidak pernah cocok dengan saldonya. Tiap pembayaran sudah mencatat
 * nilainya sendiri di `racely_reward_claims.amount`; itu yang dijumlahkan.
 */
async function readReferralSummary(
  tx: Transaction,
  userId: string,
): Promise<ReferralSummary> {
  const result = await tx.execute<{ invited: number; earned: string | number }>(sql`
    select
      (select count(*)::int from racely_players
         where referred_by = ${userId}) as invited,
      (select coalesce(sum(amount), 0) from racely_reward_claims
         where user_id = ${userId}
           and reward_key >= ${INVITER_CLAIM_PREFIX}
           and reward_key < ${INVITER_CLAIM_END}) as earned
  `);
  const row = result.rows[0];
  return {
    link: referralLink(userId),
    invited: Number(row?.invited ?? 0),
    earned: Number(row?.earned ?? 0),
  };
}

export type SettledPlayer = {
  row: PlayerRow;
  offline: OfflineEarnings | null;
};

export function settlePlayerRow(
  row: PlayerRow,
  now: Date,
  economy: EconomyConfig,
): SettledPlayer {
  // A stale request or a clock correction must never reopen an already paid interval.
  now = new Date(Math.max(now.getTime(), row.lastSettledAt.getTime()));
  const dailyMissions = row.carModel === null
    ? dailyMissionsFor(row.dailyMissions, now, economy)
    : settleDailyMissions(row.dailyMissions, {
        progress: row.progress,
        levels: { engine: row.engineLevel, tires: row.tiresLevel, battery: row.batteryLevel },
        circuit: row.circuit, economy, setup: knownCarSetup(row.setup),
        lastSettledAt: row.lastSettledAt, boostEndsAt: row.boostEndsAt,
      }, now);
  row = { ...row, dailyMissions };
  if (row.carModel === null) {
    return {
      row: { ...row, lastSettledAt: now, updatedAt: now },
      offline: null,
    };
  }

  const settlement = calculateRaceSettlement(
    {
      progress: row.progress,
      levels: {
        engine: row.engineLevel,
        tires: row.tiresLevel,
        battery: row.batteryLevel,
      },
      circuit: row.circuit,
      economy,
      setup: knownCarSetup(row.setup),
      lastSettledAt: row.lastSettledAt,
      boostEndsAt: row.boostEndsAt,
    },
    now,
  );

  return {
    row: {
      ...row,
      pending: roundCoins(row.pending + settlement.income),
      earned: roundCoins(row.earned + settlement.income),
      laps: row.laps + settlement.completedLaps,
      progress: settlement.progress,
      lastSettledAt: now,
      updatedAt: now,
    },
    offline: settlement.offline,
  };
}

/**
 * Saldo awal ikut disetel eksplisit, bukan dibiarkan ke `DEFAULT 10` di kolom:
 * `startingBalance` bisa disetel dari panel, dan default kolom tidak ikut
 * berubah. `onConflictDoUpdate` di pemanggilnya tidak menyentuh balance, jadi
 * pemain yang sudah ada tetap aman.
 */
function playerValues(identity: PlayerIdentity, economy: EconomyConfig) {
  return {
    userId: identity.userId,
    telegramUsername: identity.username,
    displayName: identity.displayName,
    photoUrl: identity.photoUrl,
    balance: economy.startingBalance,
  };
}

function levelFor(row: PlayerRow, key: Upgrade) {
  if (key === "engine") return row.engineLevel;
  if (key === "tires") return row.tiresLevel;
  return row.batteryLevel;
}

function applyUpgrade(row: PlayerRow, key: Upgrade, economy: EconomyConfig) {
  const level = levelFor(row, key);
  if (level >= economy.maxUpgradeLevel) {
    throw new GameRuleError("Upgrade ini sudah mencapai level maksimal.");
  }

  const cost = upgradeCostAt(economy, key, level);
  if (row.balance < cost) {
    throw new GameRuleError("Koin belum cukup untuk upgrade ini.");
  }

  return {
    ...row,
    balance: row.balance - cost,
    engineLevel: key === "engine" ? level + 1 : row.engineLevel,
    tiresLevel: key === "tires" ? level + 1 : row.tiresLevel,
    batteryLevel: key === "battery" ? level + 1 : row.batteryLevel,
  };
}

export async function getGameState(
  identity: PlayerIdentity,
): Promise<GameState> {
  // Dibaca sebelum transaksi dibuka: transaksi ini menahan `FOR UPDATE` pada
  // baris pemain, dan pembacaan config tidak ada urusannya dengan lock itu.
  const economy = await readEconomyConfig();

  const result = await getDatabase().transaction(async (tx) => {
    await tx
      .insert(players)
      .values(playerValues(identity, economy))
      .onConflictDoUpdate({
        target: players.userId,
        set: {
          telegramUsername: identity.username,
          displayName: identity.displayName,
          photoUrl: identity.photoUrl,
        },
      });

    const [locked] = await tx
      .select()
      .from(players)
      .where(eq(players.userId, identity.userId))
      .for("update");

    const now = new Date(Math.max(Date.now(), locked.lastSettledAt.getTime()));
    const bound = await bindReferrer(tx, locked, identity.startParam);
    const settled = settlePlayerRow(bound, now, economy);
    const rewarded = await refundRejectedWithdrawals(
      tx,
      await payInviteeMilestone(tx, settled.row, economy),
      now,
    );
    const [saved] = await tx
      .update(players)
      .set({
        balance: rewarded.balance,
        pending: settled.row.pending,
        earned: settled.row.earned,
        laps: settled.row.laps,
        progress: settled.row.progress,
        dailyMissions: settled.row.dailyMissions,
        lastSettledAt: settled.row.lastSettledAt,
        updatedAt: now,
      })
      .where(eq(players.userId, locked.userId))
      .returning();

    const history = await tx
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.userId, identity.userId))
      .orderBy(desc(withdrawals.createdAt))
      .limit(HISTORY_LIMIT);
    const daily = dailyCheckIn(
      await readDailyClaims(tx, identity.userId),
      now,
      economy,
    );
    const referral = await readReferralSummary(tx, identity.userId);
    const adReward = adRewardStatus(
      await readAdWatchesToday(tx, identity.userId, now),
      economy,
    );

    return {
      state: stateFromRow(
        saved,
        now,
        economy,
        history,
        settled.offline,
        daily,
        referral,
        adReward,
      ),
      saved,
    };
  });

  await payInviter(result.saved, economy);
  return result.state;
}

/**
 * Runs outside the player's transaction on purpose: that transaction holds a
 * `FOR UPDATE` lock on their row, and a sweep across every player's old receipts
 * has no business extending it. A failed prune must never fail the action.
 */
async function pruneActionReceipts(now: Date) {
  await getDatabase()
    .delete(actionReceipts)
    .where(
      lt(
        actionReceipts.createdAt,
        new Date(now.getTime() - RECEIPT_RETENTION_MS),
      ),
    )
    .catch(() => undefined);
}

type ActionContext = {
  tx: Transaction;
  identity: PlayerIdentity;
  requestId: string;
  economy: EconomyConfig;
  now: Date;
  dailyClaims: string[];
  adWatchesToday: number;
};

/**
 * Baris pemain sesudah aksi, plus daftar check-in kalau aksinya menambah satu.
 * Hanya `daily` yang pernah mengisi `dailyClaims` dan hanya `watch-ad` yang
 * mengisi `adWatchesToday`; sisanya membiarkan milik pemanggil apa adanya.
 */
type ActionOutcome = {
  row: PlayerRow;
  dailyClaims?: string[];
  adWatchesToday?: number;
};

type ActionHandler<T extends GameCommand["type"]> = (
  row: PlayerRow,
  action: Extract<GameCommand, { type: T }>,
  context: ActionContext,
) => ActionOutcome | Promise<ActionOutcome>;

/**
 * Ketiga aksi part memakai satu aturan yang sama di `lib/car-parts.ts`.
 * Sengaja TIDAK ditulis sebagai `ActionHandler<"buy-part" | ...>`: `Extract`
 * membuat TypeScript memperlakukan parameter tipe alias itu sebagai invariant,
 * jadi satu handler tidak akan diterima oleh ketiga kuncinya. Tipe fungsi biasa
 * tetap kena pemeriksaan kontravarian yang normal.
 */
const applyPartAction = (row: PlayerRow, action: PartCommand): ActionOutcome => {
  try {
    return { row: { ...row, ...applyPartCommand(row, action) } };
  } catch (error) {
    if (error instanceof PartRuleError) throw new GameRuleError(error.message);
    throw error;
  }
};

/**
 * Satu handler untuk setiap varian `commandSchema`. Tipe peta ini mewajibkan
 * SELURUH kuncinya ada, jadi menambahkan aksi baru tanpa menuliskan cabangnya
 * di sini adalah error kompilasi -- bukan aksi yang diam-diam tidak melakukan
 * apa pun, jebakan yang sudah dicatat AGENTS.md untuk `lib/preview-game.ts`.
 *
 * Handler hanya menghitung baris berikutnya. Yang menyimpannya tetap
 * `performGameAction`, di dalam transaksi dan lock yang sama.
 */
const applyPaintAction = (row: PlayerRow, action: PaintCommand, { economy }: ActionContext): ActionOutcome => {
  try {
    return { row: { ...row, ...applyPaintCommand(row, action, economy) } };
  } catch (error) {
    throw new GameRuleError(error instanceof Error ? error.message : "Cat gagal diproses.");
  }
};

const ACTION_HANDLERS: { [T in GameCommand["type"]]: ActionHandler<T> } = {
  sync: (row) => ({ row }),
  "buy-paint": applyPaintAction,
  "equip-paint": applyPaintAction,
  "daily-mission": async (row, action, { tx, identity, now, economy }) => {
    let result;
    try {
      result = claimDailyMission(dailyMissionsFor(row.dailyMissions, now, economy), action.day, action.kind);
    } catch (error) {
      throw new GameRuleError(error instanceof Error ? error.message : "Misi gagal diklaim.");
    }
    let credit = 0;
    if (result.reward > 0) {
      const inserted = await tx.insert(rewardClaims).values({
        userId: identity.userId,
        rewardKey: `daily-mission:${action.day}:${action.kind}`,
        amount: result.reward,
      }).onConflictDoNothing().returning({ id: rewardClaims.id });
      if (inserted.length > 0) credit = result.reward;
    }
    return { row: { ...row, dailyMissions: result.dailyMissions, balance: row.balance + credit } };
  },

  "select-car": (row, action) => {
    if (row.carModel !== null) {
      if (row.carModel !== action.model) {
        throw new GameRuleError(
          "Model sudah dikonfirmasi dan tidak dapat diganti.",
        );
      }
      // Mengulang model yang sama bukan pelanggaran, cuma tidak ada yang
      // berubah: jaringan yang putus setelah server menyimpan membuat klien
      // mencoba lagi dengan requestId baru, dan tanda terima tidak mengenali
      // percobaan itu. Sengaja tidak menyentuh warna -- warna garasi yang
      // dipilih belakangan tidak boleh tersetel ulang ke warna pendaftaran.
      // Mode preview sudah berperilaku begini sejak awal.
      return { row };
    }
    if (!isCarColor(action.model, action.color)) {
      throw new GameRuleError("Model atau warna mobil tidak valid.", 400);
    }
    return { row: { ...row, carModel: action.model, color: action.color } };
  },

  "buy-part": applyPartAction,
  "equip-part": applyPartAction,
  "unequip-part": applyPartAction,

  upgrade: (row, action, { economy }) => ({
    row: applyUpgrade(row, action.key, economy),
  }),

  claim: (row) => {
    // Only whole coins move into the withdrawable balance; the remainder keeps accruing.
    const settled = Math.floor(row.pending);
    if (settled <= 0) return { row };
    return {
      row: {
        ...row,
        balance: row.balance + settled,
        pending: roundCoins(row.pending - settled),
      },
    };
  },

  withdraw: async (row, action, { tx, identity, requestId, economy }) => {
    // Batas penarikan ditegakkan di sini, bukan di skema zod: skema dibangun
    // saat modul dimuat, sedangkan angka ini bisa berubah dari panel admin.
    if (action.coins < economy.minWithdrawCoins) {
      throw new GameRuleError(
        `Penarikan minimal ${economy.minWithdrawCoins} koin.`,
      );
    }
    if (action.coins > economy.maxWithdrawCoins) {
      throw new GameRuleError(
        `Penarikan maksimal ${economy.maxWithdrawCoins} koin per permintaan.`,
      );
    }
    if (row.balance < action.coins) {
      throw new GameRuleError("Saldo koin tidak cukup untuk penarikan ini.");
    }
    if (!accountPattern(action.method).test(action.account)) {
      throw new GameRuleError("Nomor tujuan tidak valid untuk metode ini.");
    }
    await tx.insert(withdrawals).values({
      userId: identity.userId,
      requestId,
      coins: action.coins,
      amountIdr: coinsToIdr(action.coins, economy),
      method: action.method,
      account: action.account,
      accountName: action.accountName,
    });
    return { row: { ...row, balance: row.balance - action.coins } };
  },

  /**
   * Gaspol sudah dihapus. Cabangnya tetap ada -- `commandSchema` masih menerima
   * `boost` supaya klien lama mendapat jawaban yang menjelaskan, bukan 400 yang
   * membingungkan -- tapi ia tidak pernah lagi menyentuh baris pemain, dan
   * receipt tidak ditulis karena lemparan ini mendahuluinya.
   */
  boost: () => {
    throw new GameRuleError("Gaspol sudah dihapus dari permainan.", 410);
  },

  gift: async (row, _action, { tx, identity, economy }) => {
    if (row.rewardClaimed) return { row };
    const inserted = await tx
      .insert(rewardClaims)
      .values({
        userId: identity.userId,
        rewardKey: "starter-gift",
        amount: economy.starterGift,
      })
      .onConflictDoNothing()
      .returning({ id: rewardClaims.id });
    return {
      row: {
        ...row,
        rewardClaimed: true,
        balance: row.balance + (inserted.length > 0 ? economy.starterGift : 0),
      },
    };
  },

  daily: async (row, _action, { tx, identity, economy, now, dailyClaims }) => {
    const status = dailyCheckIn(dailyClaims, now, economy);
    if (status.claimedToday) return { row };

    const today = racingDayKey(now);
    // The unique (user_id, reward_key) index is the whole guard: a double
    // tap on the same racing day inserts nothing and pays nothing.
    const inserted = await tx
      .insert(rewardClaims)
      .values({
        userId: identity.userId,
        rewardKey: `${DAILY_CLAIM_PREFIX}${today}`,
        amount: status.reward,
      })
      .onConflictDoNothing()
      .returning({ id: rewardClaims.id });
    if (inserted.length === 0) return { row };

    return {
      row: { ...row, balance: row.balance + status.reward },
      dailyClaims: [today, ...dailyClaims],
    };
  },

  /**
   * Klien memanggil ini setelah promise `show()` Adsgram resolve. Server tidak
   * bisa membuktikan iklannya benar-benar diputar, jadi yang ditegakkan di sini
   * adalah plafonnya: paling banyak `adRewardDailyCap` tontonan per hari
   * balapan, tiap tontonan satu baris `reward_claims` yang unik.
   */
  "watch-ad": async (row, _action, { tx, identity, economy, now, adWatchesToday }) => {
    const status = adRewardStatus(adWatchesToday, economy);
    if (economy.adRewardDailyCap <= 0) {
      throw new GameRuleError("Bonus iklan sedang tidak aktif.");
    }
    if (!status.available) {
      throw new GameRuleError("Jatah iklan berhadiah hari ini sudah habis.");
    }
    const inserted = await tx
      .insert(rewardClaims)
      .values({
        userId: identity.userId,
        rewardKey: adClaimKey(racingDayKey(now), adWatchesToday + 1),
        amount: status.reward,
      })
      .onConflictDoNothing()
      .returning({ id: rewardClaims.id });
    if (inserted.length === 0) return { row };
    return {
      row: { ...row, balance: row.balance + status.reward },
      adWatchesToday: adWatchesToday + 1,
    };
  },

  mission: async (row, action, { tx, identity, economy, now }) => {
    if (row.missionsClaimed.includes(action.id)) return { row };

    const mission = missions(economy).find((item) => item.id === action.id);
    if (
      !mission ||
      missionValue(stateFromRow(row, now, economy), mission.id) < mission.target
    ) {
      throw new GameRuleError("Target misi belum tercapai.");
    }
    const inserted = await tx
      .insert(rewardClaims)
      .values({
        userId: identity.userId,
        rewardKey: `mission:${mission.id}`,
        amount: mission.reward,
      })
      .onConflictDoNothing()
      .returning({ id: rewardClaims.id });
    return {
      row: {
        ...row,
        balance: row.balance + (inserted.length > 0 ? mission.reward : 0),
        missionsClaimed: [...row.missionsClaimed, mission.id],
      },
    };
  },

  color: (row, action) => {
    if (!row.carModel || !isCarColor(row.carModel, action.color)) {
      throw new GameRuleError("Warna ini tidak tersedia untuk mobilmu.", 400);
    }
    return { row: { ...row, color: action.color } };
  },

  "set-setup": (row, action) => {
    if (row.carModel === null) {
      throw new GameRuleError("Pilih mobil dulu sebelum menyetel setup.");
    }
    // `settlePlayerRow` sudah berjalan lebih dulu di `performGameAction`, jadi
    // waktu yang sudah terlanjur dibalapkan dibayar dengan setup LAMA dan setup
    // baru hanya berlaku ke depan. Tanpa urutan itu pemain bisa mengumpulkan
    // empat jam offline dengan setup pelan lalu menukarnya ke setup cepat tepat
    // sebelum sync.
    return { row: { ...row, setup: { gear: action.gear, roller: action.roller } } };
  },

  circuit: (row, action, { economy }) => {
    if (action.circuit < row.circuit) {
      throw new GameRuleError("Trek lama tidak bisa dipilih lagi.");
    }
    const needed = circuitUnlockLaps(economy, action.circuit);
    if (row.laps < needed) {
      throw new GameRuleError(
        `Selesaikan ${needed} putaran untuk membuka sirkuit ini.`,
      );
    }
    return { row: { ...row, circuit: action.circuit } };
  },
};

/**
 * Aksi yang benar-benar punya handler di sini. Diekspor supaya test paritas
 * bisa membandingkannya dengan varian `commandSchema` secara langsung, bukan
 * dengan meng-grep source file ini -- pembacaan yang ikut merah setiap kali
 * sebuah variabel diganti nama, dan ikut hijau pada cabang yang kebetulan
 * hanya disebut di komentar.
 */
export const HANDLED_ACTION_TYPES = Object.keys(
  ACTION_HANDLERS,
) as GameCommand["type"][];

export async function performGameAction(
  identity: PlayerIdentity,
  requestId: string,
  action: GameCommand,
): Promise<GameState> {
  // Sama seperti getGameState: di luar transaksi, sebelum lock diambil.
  const economy = await readEconomyConfig();

  const result = await getDatabase().transaction(async (tx) => {
    await tx
      .insert(players)
      .values(playerValues(identity, economy))
      .onConflictDoUpdate({
        target: players.userId,
        set: {
          telegramUsername: identity.username,
          displayName: identity.displayName,
          photoUrl: identity.photoUrl,
        },
      });

    const [locked] = await tx
      .select()
      .from(players)
      .where(eq(players.userId, identity.userId))
      .for("update");

    const now = new Date(Math.max(Date.now(), locked.lastSettledAt.getTime()));
    const bound = await bindReferrer(tx, locked, identity.startParam);
    const settled = settlePlayerRow(bound, now, economy);
    let next = await refundRejectedWithdrawals(
      tx,
      await payInviteeMilestone(tx, settled.row, economy),
      now,
    );
    let dailyClaims = await readDailyClaims(tx, identity.userId);
    let adWatchesToday = await readAdWatchesToday(tx, identity.userId, now);

    if (action.type !== "sync") {
      const [receipt] = await tx
        .select({ requestId: actionReceipts.requestId })
        .from(actionReceipts)
        .where(
          and(
            eq(actionReceipts.userId, identity.userId),
            eq(actionReceipts.requestId, requestId),
          ),
        )
        .limit(1);

      if (receipt) {
        const [saved] = await tx
          .update(players)
          .set({
            balance: next.balance,
            pending: next.pending,
            earned: next.earned,
            laps: next.laps,
            progress: next.progress,
            dailyMissions: next.dailyMissions,
            lastSettledAt: next.lastSettledAt,
            updatedAt: now,
          })
          .where(eq(players.userId, identity.userId))
          .returning();
        const replayHistory = await tx
          .select()
          .from(withdrawals)
          .where(eq(withdrawals.userId, identity.userId))
          .orderBy(desc(withdrawals.createdAt))
          .limit(HISTORY_LIMIT);
        return {
          state: stateFromRow(
            saved,
            now,
            economy,
            replayHistory,
            settled.offline,
            dailyCheckIn(dailyClaims, now, economy),
            await readReferralSummary(tx, identity.userId),
            adRewardStatus(adWatchesToday, economy),
          ),
          saved,
        };
      }
    }

    if (
      next.carModel === null &&
      action.type !== "sync" &&
      action.type !== "select-car"
    ) {
      throw new GameRuleError("Pilih mobilmu sebelum mulai bermain.");
    }

    // Cast sekali, di sini: TypeScript tidak bisa mengorelasikan `action.type`
    // dengan entri peta yang sepadan. Penjagaannya ada di deklarasi
    // ACTION_HANDLERS, yang mewajibkan satu handler untuk setiap varian.
    const handler = ACTION_HANDLERS[action.type] as ActionHandler<
      GameCommand["type"]
    >;
    const outcome = await handler(next, action, {
      tx,
      identity,
      requestId,
      economy,
      now,
      dailyClaims,
      adWatchesToday,
    });
    next = outcome.row;
    dailyClaims = outcome.dailyClaims ?? dailyClaims;
    adWatchesToday = outcome.adWatchesToday ?? adWatchesToday;

    const [saved] = await tx
      .update(players)
      .set({
        balance: next.balance,
        pending: next.pending,
        earned: next.earned,
        laps: next.laps,
        progress: next.progress,
        engineLevel: next.engineLevel,
        tiresLevel: next.tiresLevel,
        batteryLevel: next.batteryLevel,
        boostEndsAt: next.boostEndsAt,
        cooldownEndsAt: next.cooldownEndsAt,
        rewardClaimed: next.rewardClaimed,
        missionsClaimed: next.missionsClaimed,
        dailyMissions: next.dailyMissions,
        ownedPaints: next.ownedPaints,
        bodyParts: next.bodyParts,
        setup: next.setup,
        carModel: next.carModel,
        color: next.color,
        circuit: next.circuit,
        lastSettledAt: next.lastSettledAt,
        version: next.version + (action.type === "sync" ? 0 : 1),
        updatedAt: now,
      })
      .where(eq(players.userId, identity.userId))
      .returning();

    const history = await tx
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.userId, identity.userId))
      .orderBy(desc(withdrawals.createdAt))
      .limit(HISTORY_LIMIT);
    const response = stateFromRow(
      saved,
      now,
      economy,
      history,
      settled.offline,
      dailyCheckIn(dailyClaims, now, economy),
      await readReferralSummary(tx, identity.userId),
      adRewardStatus(adWatchesToday, economy),
    );
    if (action.type !== "sync") {
      // Deliberately no response snapshot: (userId, requestId) is the whole
      // idempotency key, and a stored GameState would copy the player's
      // withdrawal account numbers into this table on every later action.
      await tx.insert(actionReceipts).values({
        userId: identity.userId,
        requestId,
        actionType: action.type,
      });
    }

    return { state: response, saved };
  });

  // Di luar transaksi pemain: lihat payInviter untuk alasan urutan penguncian.
  await payInviter(result.saved, economy);

  if (action.type !== "sync" && Math.random() < RECEIPT_PRUNE_PROBABILITY) {
    await pruneActionReceipts(new Date());
  }

  return result.state;
}
