import type { GameState } from "@/lib/game";

export type GameKey = readonly [url: string, initData: string];

export function requestHeaders(initData: string) {
  return initData ? { Authorization: `tma ${initData}` } : undefined;
}

export class GameRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GameRequestError";
  }
}

export async function readGameResponse(response: Response): Promise<GameState> {
  const result = (await response.json()) as GameState | { error?: string };
  if (!response.ok) {
    throw new GameRequestError(
      "error" in result && result.error
        ? result.error
        : "Progres Racely belum bisa dimuat.",
      response.status,
    );
  }
  return result as GameState;
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
