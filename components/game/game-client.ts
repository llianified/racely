import type { GameCommand, GameState } from "@/lib/game";
import type { RacelyChannelErrorCode } from "@/lib/racely-channel";

export type GameKey = readonly [url: string, initData: string];

export function requestHeaders(initData: string) {
  return initData ? { Authorization: `tma ${initData}` } : undefined;
}

export class GameRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: RacelyChannelErrorCode,
  ) {
    super(message);
    this.name = "GameRequestError";
  }
}

export async function readGameResponse(response: Response): Promise<GameState> {
  const result = (await response.json()) as
    | GameState
    | { error?: string; code?: RacelyChannelErrorCode };
  if (!response.ok) {
    throw new GameRequestError(
      "error" in result && result.error
        ? result.error
        : "Progres Racely belum bisa dimuat.",
      response.status,
      "code" in result ? result.code : undefined,
    );
  }
  return result as GameState;
}

export function createGameActionSender() {
  const pending = new Map<string, { body: string; type: GameCommand["type"]; uncertain: boolean }>();

  return async (action: GameCommand, initData: string): Promise<GameState> => {
    const key = JSON.stringify(Object.fromEntries(Object.entries(action).sort(([a], [b]) => a.localeCompare(b))));
    if (action.type === "withdraw" && !pending.has(key) && [...pending.values()].some((entry) => entry.type === "withdraw")) {
      throw new GameRequestError("Penarikan sebelumnya belum terkonfirmasi. Ulangi dengan data penarikan yang sama.", 409);
    }
    const entry = pending.get(key) ?? {
      body: JSON.stringify({ requestId: crypto.randomUUID(), action }),
      type: action.type,
      uncertain: false,
    };
    pending.set(key, entry);
    try {
      const response = await fetch("/api/game/action", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/json", ...requestHeaders(initData) },
        body: entry.body,
        credentials: "same-origin",
      });
      const next = await readGameResponse(response);
      pending.delete(key);
      return next;
    } catch (cause) {
      // A timeout, broken response, or 5xx can follow a committed transaction.
      // Even a later 401/429 cannot prove that the original request was rejected.
      if (!entry.uncertain && cause instanceof GameRequestError && cause.status >= 400 && cause.status < 500 && cause.status !== 408) {
        pending.delete(key);
      } else {
        entry.uncertain = true;
      }
      throw cause;
    }
  };
}

/**
 * initData is signed once when the Mini App opens and the server rejects it
 * after 24h. Without this check a long-lived session keeps polling into 401s
 * while the local reducer goes on adding coins that will never be saved, so the
 * player races into a void. Treat it as terminal and send them back to Telegram.
 */
export function isSessionExpired(error: unknown) {
  return error instanceof GameRequestError && error.status === 401;
}

export function isChannelMembershipRequired(error: unknown) {
  return (
    error instanceof GameRequestError &&
    error.code === "CHANNEL_MEMBERSHIP_REQUIRED"
  );
}

export function isChannelMembershipUnavailable(error: unknown) {
  return (
    error instanceof GameRequestError &&
    error.code === "CHANNEL_MEMBERSHIP_UNAVAILABLE"
  );
}
