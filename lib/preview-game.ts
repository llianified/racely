import "server-only";

import { Buffer } from "node:buffer";
import { z } from "zod";
import {
  accountPattern,
  INITIAL_GAME,
  MISSIONS,
  lapReward,
  lapSeconds,
  missionValue,
  roundCoins,
  STARTER_GIFT,
  upgradeCost,
  WITHDRAW_METHODS,
  type GameCommand,
  type GameState,
  type Upgrade,
  type WithdrawMethod,
} from "./game";
import { CAR_MODEL_IDS, isCarColor } from "./car-catalog";
import type { PlayerIdentity } from "@/lib/telegram-auth";

export const previewCarActionSchema = z.object({
  requestId: z.string().uuid(),
  action: z.discriminatedUnion("type", [
    z.object({ type: z.literal("select-car"), model: z.enum(CAR_MODEL_IDS), color: z.string().max(7) }).strict(),
    z.object({ type: z.literal("color"), color: z.string().max(7) }).strict(),
  ]),
}).strict();

const MAX_OFFLINE_SECONDS = 24 * 60 * 60;
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
  state: z.object({
    developmentPreview: z.boolean().default(true),
    carSelection: z.object({
      model: z.enum(CAR_MODEL_IDS).nullable(),
      returningPlayer: z.boolean(),
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
    circuit: z.number().int().min(0).max(1),
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

function initialPreviewGame(identity: PlayerIdentity, now: number): PreviewGame {
  return {
    version: 1,
    userId: identity.userId,
    updatedAt: now,
    receipts: [],
    state: {
      ...INITIAL_GAME,
      developmentPreview: true,
      carSelection: { model: null, returningPlayer: false },
      levels: { ...INITIAL_GAME.levels },
      missionsClaimed: [],
      withdrawals: [],
      player: {
        name: identity.displayName,
        username: identity.username,
        photoUrl: identity.photoUrl,
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

function readPreviewGame(request: Request, identity: PlayerIdentity) {
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
      const settled = settlePreviewGame(parsed.data, Date.now());
      return {
        ...settled,
        state: { ...settled.state, carSelection: { model: null, returningPlayer: true } },
      };
    }
    return parsed.data;
  } catch {
    return initialPreviewGame(identity, Date.now());
  }
}

function settlePreviewGame(game: PreviewGame, now: number): PreviewGame {
  if (game.state.carSelection?.model === null) return { ...game, updatedAt: now };
  const elapsed = Math.min(
    MAX_OFFLINE_SECONDS,
    Math.max(0, (now - game.updatedAt) / 1000),
  );
  if (elapsed === 0) return game;

  const boostedSeconds = Math.min(elapsed, game.state.boostLeft);
  const normalSeconds = elapsed - boostedSeconds;
  const boostedProgress =
    boostedSeconds > 0
      ? boostedSeconds / lapSeconds({ ...game.state, boostLeft: 1 })
      : 0;
  const normalProgress =
    normalSeconds > 0
      ? normalSeconds / lapSeconds({ ...game.state, boostLeft: 0 })
      : 0;
  const progress = game.state.progress + boostedProgress + normalProgress;
  const completedLaps = Math.floor(progress);
  const income = roundCoins(completedLaps * lapReward(game.state));

  return {
    ...game,
    updatedAt: now,
    state: {
      ...game.state,
      progress: progress % 1,
      laps: game.state.laps + completedLaps,
      pending: roundCoins(game.state.pending + income),
      earned: roundCoins(game.state.earned + income),
      boostLeft: Math.max(0, game.state.boostLeft - elapsed),
      cooldown: Math.max(0, game.state.cooldown - elapsed),
    },
  };
}

function serializePreviewGame(game: PreviewGame) {
  return Buffer.from(JSON.stringify(game), "utf8").toString("base64url");
}

function applyUpgrade(state: GameState, key: Upgrade) {
  const level = state.levels[key];
  if (level >= 10) {
    throw new PreviewGameRuleError(
      "Upgrade ini sudah mencapai level maksimal.",
    );
  }
  const cost = upgradeCost(key, level);
  if (state.balance < cost) {
    throw new PreviewGameRuleError("Koin belum cukup untuk upgrade ini.");
  }
  return {
    ...state,
    balance: state.balance - cost,
    levels: { ...state.levels, [key]: level + 1 },
  };
}

export function getPreviewGameState(
  request: Request,
  identity: PlayerIdentity,
) {
  const game = settlePreviewGame(readPreviewGame(request, identity), Date.now());
  return { state: game.state, cookieValue: serializePreviewGame(game) };
}

export function performPreviewGameAction(
  request: Request,
  identity: PlayerIdentity,
  requestId: string,
  action: GameCommand | z.infer<typeof previewCarActionSchema>["action"],
) {
  const now = Date.now();
  let game = settlePreviewGame(readPreviewGame(request, identity), now);
  const selection = game.state.carSelection;

  if (action.type === "select-car") {
    if (!CAR_MODEL_IDS.includes(action.model) || !isCarColor(action.model, action.color)) {
      throw new PreviewGameRuleError("Model atau warna mobil tidak valid.", 400);
    }
    if (selection?.model) {
      if (selection.model !== action.model) {
        throw new PreviewGameRuleError("Model sudah dikonfirmasi dan tidak dapat diganti.");
      }
      // A retry must not reset a later garage color or grant any progress.
      return { state: game.state, cookieValue: serializePreviewGame(game) };
    }
  } else if (selection?.model === null && action.type !== "sync") {
    throw new PreviewGameRuleError("Pilih mobilmu sebelum mulai bermain.");
  }
  if (action.type === "color" && !isCarColor(selection?.model ?? "neo-falcon", action.color)) {
    throw new PreviewGameRuleError("Warna ini tidak tersedia untuk mobilmu.", 400);
  }

  if (action.type !== "sync" && game.receipts.includes(requestId)) {
    return { state: game.state, cookieValue: serializePreviewGame(game) };
  }

  let state = game.state;
  if (action.type === "select-car") {
    state = {
      ...state,
      carSelection: { model: action.model, returningPlayer: selection?.returningPlayer ?? false },
      color: action.color,
    };
  } else if (action.type === "upgrade") {
    state = applyUpgrade(state, action.key);
  } else if (action.type === "claim" && Math.floor(state.pending) > 0) {
    const settled = Math.floor(state.pending);
    state = {
      ...state,
      balance: state.balance + settled,
      pending: roundCoins(state.pending - settled),
    };
  } else if (action.type === "withdraw") {
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
    if (state.cooldown > 0) {
      throw new PreviewGameRuleError("Boost masih mengisi ulang.");
    }
    state = { ...state, boostLeft: 10, cooldown: 35 };
  } else if (action.type === "gift" && !state.rewardClaimed) {
    state = {
      ...state,
      rewardClaimed: true,
      balance: state.balance + STARTER_GIFT,
    };
  } else if (action.type === "mission") {
    const mission = MISSIONS.find((item) => item.id === action.id);
    if (
      !mission ||
      state.missionsClaimed.includes(action.id) ||
      missionValue(state, action.id) < mission.target
    ) {
      throw new PreviewGameRuleError("Target misi belum tercapai.");
    }
    state = {
      ...state,
      balance: state.balance + mission.reward,
      missionsClaimed: [...state.missionsClaimed, action.id],
    };
  } else if (action.type === "color") {
    state = { ...state, color: action.color };
  } else if (action.type === "circuit") {
    if (action.circuit === 1 && state.laps < 25) {
      throw new PreviewGameRuleError(
        "Selesaikan 25 putaran untuk membuka sirkuit ini.",
      );
    }
    state = { ...state, circuit: action.circuit };
  }

  game = {
    ...game,
    state,
    updatedAt: now,
    receipts:
      action.type === "sync"
        ? game.receipts
        : [...game.receipts, requestId].slice(-MAX_RECEIPTS),
  };
  return { state: game.state, cookieValue: serializePreviewGame(game) };
}
