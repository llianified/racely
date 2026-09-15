import "server-only";
import { dailyMissionsSchema, dailyMissionsFor, settleDailyMissions, claimDailyMission } from "./daily-missions";
import { ownedPaintsSchema, applyPaintCommand } from "./car-paints";
import { carSetupSchema, knownCarSetup } from "./car-setup";

import { Buffer } from "node:buffer";
import { z } from "zod";
import {
  accountPattern,
  INITIAL_GAME,
  missions,
  missionValue,
  roundCoins,
  WITHDRAW_METHODS,
  type GameCommand,
  type GameState,
  type OfflineEarnings,
  type Upgrade,
  type WithdrawMethod,
} from "./game";
import { circuitUnlockLaps, upgradeCostAt, type EconomyConfig } from "./economy-config";
import {
  adRewardStatus,
  calculateRaceSettlement,
  DAILY_HISTORY_DAYS,
  dailyCheckIn,
  racingDayKey,
} from "./game-economy";
import { LAST_CIRCUIT } from "./track-layout";
import { CAR_MODEL_IDS, canSwitchCar, isCarColor, isReferralCar } from "./car-catalog";
import { applyPartCommand, bodyPartsSchema, PartRuleError } from "./car-parts";
import { REFERRAL_MAX_FRIENDS } from "./referral-rewards";
import { referralLink } from "./telegram-bot";
import { proxiedAvatarPath } from "./telegram-avatar";
import type { PlayerIdentity } from "@/lib/telegram-auth";

export const previewCarActionSchema = z.object({
  requestId: z.string().uuid(),
  action: z.discriminatedUnion("type", [
    z.object({ type: z.literal("select-car"), model: z.enum(CAR_MODEL_IDS), color: z.string().max(7) }).strict(),
    z.object({ type: z.literal("color"), color: z.string().max(7) }).strict(),
  ]),
}).strict();

const MAX_RECEIPTS = 12;
const MAX_WITHDRAWALS = 8;
const METHOD_IDS = WITHDRAW_METHODS.map((method) => method.id) as [
  WithdrawMethod,
  ...WithdrawMethod[],
];
const previewGameSchema = z.object({
  version: z.literal(1),
  userId: z.string(),
  updatedAt: z.number().int().nonnegative(),
  receipts: z.array(z.string().uuid()).max(MAX_RECEIPTS),
  dailyClaims: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .max(DAILY_HISTORY_DAYS)
    .default([]),
  /**
   * Tontonan iklan berhadiah hari ini; hari lain cukup di-reset ke nol.
   * `day` kosong berarti belum pernah menonton dan harus lolos parse juga --
   * kalau tidak seluruh cookie dianggap rusak dan progres pemain hilang.
   */
  adWatches: z
    .object({
      day: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
      count: z.number().int().nonnegative(),
    })
    .default({ day: "", count: 0 }),
  state: z.object({
    developmentPreview: z.boolean().default(true),
    bodyParts: bodyPartsSchema.optional(),
    dailyMissions: dailyMissionsSchema.optional(),
    setup: carSetupSchema.optional(),
    ownedPaints: ownedPaintsSchema.optional(),
    carSelection: z.object({
      model: z.enum(CAR_MODEL_IDS).nullable(),
      returningPlayer: z.boolean(),
      // Opsional: cookie preview lama belum mencatat mobil starter-nya.
      starterModel: z.enum(CAR_MODEL_IDS).nullable().optional(),
    }).optional(),
    balance: z.number().nonnegative(),
    pending: z.number().nonnegative(),
    earned: z.number().nonnegative(),
    laps: z.number().int().nonnegative(),
    progress: z.number().min(0).max(1),
    levels: z.object({
      engine: z.number().int().min(1).max(10),
      tires: z.number().int().min(1).max(10),
      battery: z.number().int().min(1).max(10),
    }),
    boostLeft: z.number().nonnegative(),
    cooldown: z.number().nonnegative(),
    rewardClaimed: z.boolean(),
    missionsClaimed: z.array(z.string()),
    color: z.string(),
    circuit: z.number().int().min(0).max(LAST_CIRCUIT),
    player: z.object({
      name: z.string(),
      username: z.string().nullable(),
      photoUrl: z.string().nullable(),
    }),
    withdrawals: z
      .array(
        z.object({
          id: z.string(),
          coins: z.number().nonnegative(),
          method: z.enum(METHOD_IDS),
          account: z.string(),
          accountName: z.string(),
          status: z.enum(["pending", "processing", "paid", "rejected"]),
          createdAt: z.string(),
        }),
      )
      .max(MAX_WITHDRAWALS)
      .default([]),
  }),
});

type PreviewGame = z.infer<typeof previewGameSchema>;
/** Bentuk state di dalam cookie: GameState tanpa field turunan per-respons. */
type PreviewState = PreviewGame["state"];

export const PREVIEW_GAME_COOKIE = "racely-preview-game";

export class PreviewGameRuleError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
    this.name = "PreviewGameRuleError";
  }
}

/**
 * `economy` sengaja tidak ikut ke dalam cookie. Ia config server, bukan progres
 * pemain: menyimpannya berarti membekukan snapshot yang langsung basi begitu
 * ekonomi disetel dari panel, dan menggelembungkan cookie di tiap permintaan.
 * `previewResult` yang menyuntikkannya ke respons, sama seperti `daily`.
 */
const { economy: _initialEconomy, ...INITIAL_PREVIEW_STATE } = INITIAL_GAME;

function initialPreviewGame(identity: PlayerIdentity, now: number): PreviewGame {
  return {
    version: 1,
    userId: identity.userId,
    updatedAt: now,
    receipts: [],
    dailyClaims: [],
    adWatches: { day: "", count: 0 },
    state: {
      ...INITIAL_PREVIEW_STATE,
      developmentPreview: true,
      carSelection: { model: null, returningPlayer: false },
      levels: { ...INITIAL_GAME.levels },
      missionsClaimed: [],
      withdrawals: [],
      player: {
        name: identity.displayName,
        username: identity.username,
        photoUrl: proxiedAvatarPath(identity.photoUrl),
      },
    },
  };
}

function readCookie(request: Request, name: string) {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : "";
}

function readPreviewGame(
  request: Request,
  identity: PlayerIdentity,
  economy: EconomyConfig,
) {
  const encoded = readCookie(request, PREVIEW_GAME_COOKIE);
  if (!encoded) return initialPreviewGame(identity, Date.now());

  try {
    const parsed = previewGameSchema.safeParse(
      JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
    );
    if (!parsed.success || parsed.data.userId !== identity.userId) {
      return initialPreviewGame(identity, Date.now());
    }
    if (!parsed.data.state.carSelection) {
      // Credit time owed before the offer, then freeze without resetting progress.
      const { game } = settlePreviewGame(parsed.data, Date.now(), economy);
      return {
        ...game,
        state: { ...game.state, carSelection: { model: null, returningPlayer: true } },
      };
    }
    return parsed.data;
  } catch {
    return initialPreviewGame(identity, Date.now());
  }
}

type SettledPreview = { game: PreviewGame; offline: OfflineEarnings | null };

/**
 * Delegates to the same pure settlement the database path uses, so the offline
 * cap and its half rate cannot drift between `pnpm dev` and production. The
 * cookie stores boost as seconds left, so it is converted to the deadline the
 * settlement expects.
 */
function settlePreviewGame(
  game: PreviewGame,
  now: number,
  economy: EconomyConfig,
): SettledPreview {
  now = Math.max(now, game.updatedAt);
  const dailyMissions = game.state.carSelection?.model === null
    ? dailyMissionsFor(game.state.dailyMissions, new Date(now), economy)
    : settleDailyMissions(game.state.dailyMissions, {
        progress: game.state.progress, levels: game.state.levels,
        circuit: game.state.circuit, economy, setup: knownCarSetup(game.state.setup),
        lastSettledAt: new Date(game.updatedAt),
        boostEndsAt: game.state.boostLeft > 0 ? new Date(game.updatedAt + game.state.boostLeft * 1000) : null,
      }, new Date(now));
  game = { ...game, state: { ...game.state, dailyMissions } };
  if (game.state.carSelection?.model === null) {
    return { game: { ...game, updatedAt: now }, offline: null };
  }
  const elapsed = Math.max(0, (now - game.updatedAt) / 1000);
  if (elapsed === 0) return { game, offline: null };

  const settlement = calculateRaceSettlement(
    {
      progress: game.state.progress,
      levels: game.state.levels,
      circuit: game.state.circuit,
      economy,
      setup: knownCarSetup(game.state.setup),
      lastSettledAt: new Date(game.updatedAt),
      boostEndsAt:
        game.state.boostLeft > 0
          ? new Date(game.updatedAt + game.state.boostLeft * 1000)
          : null,
    },
    new Date(now),
  );

  return {
    game: {
      ...game,
      updatedAt: now,
      state: {
        ...game.state,
        progress: settlement.progress,
        laps: game.state.laps + settlement.completedLaps,
        pending: roundCoins(game.state.pending + settlement.income),
        earned: roundCoins(game.state.earned + settlement.income),
        // Legacy cookie timers no longer affect automatic racing.
        boostLeft: 0,
        cooldown: 0,
      },
    },
    offline: settlement.offline,
  };
}

/**
 * The summary rides the response only. Keeping it out of the cookie is what
 * stops one absence from being reported -- and re-reported -- on every later
 * request.
 */
function previewResult(
  game: PreviewGame,
  offline: OfflineEarnings | null,
  now: number,
  economy: EconomyConfig,
): { state: GameState; cookieValue: string } {
  const state: GameState = {
    ...game.state,
    economy,
    daily: dailyCheckIn(game.dailyClaims, new Date(now), economy),
    adReward: adRewardStatus(adWatchesToday(game, now), economy),
    // Mode preview hanya punya satu pemain di dalam cookie, jadi tidak ada yang
    // bisa diajak atau dibayar. Link tetap dibangun agar kartu ajakan dapat diuji,
    // sementara akses item eksklusif preview diberikan langsung di action terkait.
    referral: { link: referralLink(game.userId), invited: 0, completed: 0, earned: 0 },
  };
  return {
    state: {
      ...state,
      // Transien dan tidak ikut cookie, sama seperti di server.
      ...(offline ? { offlineEarnings: offline } : {}),
    },
    cookieValue: serializePreviewGame(game),
  };
}

function adWatchesToday(game: PreviewGame, now: number) {
  return game.adWatches.day === racingDayKey(new Date(now)) ? game.adWatches.count : 0;
}

function serializePreviewGame(game: PreviewGame) {
  return Buffer.from(JSON.stringify(game), "utf8").toString("base64url");
}

function applyUpgrade(
  state: PreviewState,
  key: Upgrade,
  economy: EconomyConfig,
) {
  const level = state.levels[key];
  if (level >= economy.maxUpgradeLevel) {
    throw new PreviewGameRuleError(
      "Upgrade ini sudah mencapai level maksimal.",
    );
  }
  const cost = upgradeCostAt(economy, key, level);
  if (state.balance < cost) {
    throw new PreviewGameRuleError("Koin belum cukup untuk upgrade ini.");
  }
  return {
    ...state,
    balance: state.balance - cost,
    levels: { ...state.levels, [key]: level + 1 },
  };
}

/**
 * Preview hanya hidup saat `pnpm dev`, dan progresnya cuma cookie sekali pakai.
 * Menunggu ratusan putaran cuma untuk melihat trek berikutnya tidak menguji apa
 * pun, jadi semua sirkuit dibuka di sini. Ambang aslinya tetap utuh di
 * `lib/game-server.ts` — itu jalur produksi, dan test yang menjaganya.
 */
const unlockAllCircuits = (economy: EconomyConfig): EconomyConfig => ({
  ...economy,
  circuitUnlockLaps: 0,
  technicalUnlockLaps: 0,
});

export function getPreviewGameState(
  request: Request,
  identity: PlayerIdentity,
  config: EconomyConfig,
) {
  const economy = unlockAllCircuits(config);
  const stored = readPreviewGame(request, identity, economy);
  const now = Math.max(Date.now(), stored.updatedAt);
  const { game, offline } = settlePreviewGame(stored, now, economy);
  return previewResult(game, offline, now, economy);
}

export function performPreviewGameAction(
  request: Request,
  identity: PlayerIdentity,
  requestId: string,
  action: GameCommand | z.infer<typeof previewCarActionSchema>["action"],
  config: EconomyConfig,
) {
  const economy = unlockAllCircuits(config);
  const stored = readPreviewGame(request, identity, economy);
  // Actions and response fields must use the same monotonic clock as settlement.
  const now = Math.max(Date.now(), stored.updatedAt);
  const settled = settlePreviewGame(stored, now, economy);
  const { offline } = settled;
  let game = settled.game;
  const selection = game.state.carSelection;

  if (action.type === "select-car") {
    if (!CAR_MODEL_IDS.includes(action.model) || !isCarColor(action.model, action.color)) {
      throw new PreviewGameRuleError("Model atau warna mobil tidak valid.", 400);
    }
    if (selection?.model) {
      // A retry must not reset a later garage color or grant any progress.
      if (selection.model === action.model) return previewResult(game, offline, now, economy);
      // Pergantian hanya sah lewat mobil hadiah ajakan, dan turunnya hanya ke
      // mobil starter yang dipilih saat onboarding -- sama seperti server.
      if (!canSwitchCar(action.model, selection.starterModel ?? null, REFERRAL_MAX_FRIENDS)) {
        throw new PreviewGameRuleError("Model sudah dikonfirmasi dan tidak dapat diganti.");
      }
    }
  } else if (selection?.model === null && action.type !== "sync") {
    throw new PreviewGameRuleError("Pilih mobilmu sebelum mulai bermain.");
  }
  if (action.type === "color" && !isCarColor(selection?.model ?? "neo-falcon", action.color)) {
    throw new PreviewGameRuleError("Warna ini tidak tersedia untuk mobilmu.", 400);
  }

  if (action.type !== "sync" && game.receipts.includes(requestId)) {
    return previewResult(game, offline, now, economy);
  }

  let state = game.state;
  let dailyClaims = game.dailyClaims;
  let adWatches = game.adWatches;
  if (action.type === "select-car") {
    state = {
      ...state,
      carSelection: {
        model: action.model,
        returningPlayer: selection?.returningPlayer ?? false,
        starterModel: selection?.starterModel ?? (isReferralCar(action.model) ? null : action.model),
      },
      color: action.color,
    };
  } else if (action.type === "buy-part" || action.type === "equip-part" || action.type === "unequip-part") {
    try {
      state = { ...state, ...applyPartCommand(state, action, REFERRAL_MAX_FRIENDS) };
    } catch (error) {
      if (error instanceof PartRuleError) throw new PreviewGameRuleError(error.message);
      throw error;
    }
  } else if (action.type === "buy-paint" || action.type === "equip-paint") {
    try {
      state = { ...state, ...applyPaintCommand(state, action, economy, REFERRAL_MAX_FRIENDS) };
    } catch (error) {
      throw new PreviewGameRuleError(error instanceof Error ? error.message : "Cat gagal diproses.");
    }
  } else if (action.type === "daily-mission") {
    try {
      const result = claimDailyMission(dailyMissionsFor(state.dailyMissions, new Date(now), economy), action.day, action.kind);
      state = { ...state, dailyMissions: result.dailyMissions, balance: state.balance + result.reward };
    } catch (error) {
      throw new PreviewGameRuleError(error instanceof Error ? error.message : "Misi gagal diklaim.");
    }
  } else if (action.type === "upgrade") {
    state = applyUpgrade(state, action.key, economy);
  } else if (action.type === "claim" && Math.floor(state.pending) > 0) {
    const settled = Math.floor(state.pending);
    state = {
      ...state,
      balance: state.balance + settled,
      pending: roundCoins(state.pending - settled),
    };
  } else if (action.type === "withdraw") {
    // Sama seperti server: batas config ditegakkan di sini, bukan di skema.
    if (action.coins < economy.minWithdrawCoins) {
      throw new PreviewGameRuleError(
        `Penarikan minimal ${economy.minWithdrawCoins} koin.`,
      );
    }
    if (action.coins > economy.maxWithdrawCoins) {
      throw new PreviewGameRuleError(
        `Penarikan maksimal ${economy.maxWithdrawCoins} koin per permintaan.`,
      );
    }
    if (state.balance < action.coins) {
      throw new PreviewGameRuleError(
        "Saldo koin tidak cukup untuk penarikan ini.",
      );
    }
    if (!accountPattern(action.method).test(action.account)) {
      throw new PreviewGameRuleError(
        "Nomor tujuan tidak valid untuk metode ini.",
      );
    }
    state = {
      ...state,
      balance: state.balance - action.coins,
      withdrawals: [
        {
          id: requestId,
          coins: action.coins,
          method: action.method,
          account: action.account,
          accountName: action.accountName,
          status: "pending" as const,
          createdAt: new Date(now).toISOString(),
        },
        ...state.withdrawals,
      ].slice(0, MAX_WITHDRAWALS),
    };
  } else if (action.type === "boost") {
    throw new PreviewGameRuleError("Gaspol sudah dihapus dari permainan.", 410);
  } else if (action.type === "gift" && !state.rewardClaimed) {
    state = {
      ...state,
      rewardClaimed: true,
      balance: state.balance + economy.starterGift,
    };
  } else if (action.type === "daily") {
    const status = dailyCheckIn(game.dailyClaims, new Date(now), economy);
    if (!status.claimedToday) {
      state = { ...state, balance: state.balance + status.reward };
      dailyClaims = [racingDayKey(new Date(now)), ...game.dailyClaims].slice(
        0,
        DAILY_HISTORY_DAYS,
      );
    }
  } else if (action.type === "watch-ad") {
    // Pesan dan plafonnya sama dengan server; yang berbeda hanya tempat
    // hitungannya disimpan (cookie, bukan reward_claims).
    const watched = adWatchesToday(game, now);
    const status = adRewardStatus(watched, economy);
    if (economy.adRewardDailyCap <= 0) {
      throw new PreviewGameRuleError("Bonus iklan sedang tidak aktif.");
    }
    if (!status.available) {
      throw new PreviewGameRuleError("Jatah iklan berhadiah hari ini sudah habis.");
    }
    state = { ...state, balance: state.balance + status.reward };
    adWatches = { day: racingDayKey(new Date(now)), count: watched + 1 };
  } else if (action.type === "mission") {
    // Misi yang sudah diklaim bukan kesalahan, hanya tidak ada yang berubah --
    // sama seperti server. Sebelumnya cabang ini melempar "Target misi belum
    // tercapai", pesan yang menuduh hal yang keliru dan hanya muncul di
    // `pnpm dev`, sehingga perilakunya menyimpang dari produksi.
    if (!state.missionsClaimed.includes(action.id)) {
      const mission = missions(economy).find((item) => item.id === action.id);
      if (!mission || missionValue(state, action.id) < mission.target) {
        throw new PreviewGameRuleError("Target misi belum tercapai.");
      }
      state = {
        ...state,
        balance: state.balance + mission.reward,
        missionsClaimed: [...state.missionsClaimed, action.id],
      };
    }
  } else if (action.type === "color") {
    state = { ...state, color: action.color };
  } else if (action.type === "set-setup") {
    if (!selection?.model) {
      throw new PreviewGameRuleError("Pilih mobil dulu sebelum menyetel setup.");
    }
    state = { ...state, setup: { gear: action.gear, roller: action.roller } };
  } else if (action.type === "circuit") {
    if (action.circuit < state.circuit) {
      throw new PreviewGameRuleError("Trek lama tidak bisa dipilih lagi.");
    }
    const needed = circuitUnlockLaps(economy, action.circuit);
    if (state.laps < needed) {
      throw new PreviewGameRuleError(
        `Selesaikan ${needed} putaran untuk membuka sirkuit ini.`,
      );
    }
    state = { ...state, circuit: action.circuit };
  }

  game = {
    ...game,
    state,
    dailyClaims,
    adWatches,
    updatedAt: now,
    receipts:
      action.type === "sync"
        ? game.receipts
        : [...game.receipts, requestId].slice(-MAX_RECEIPTS),
  };
  return previewResult(game, offline, now, economy);
}
