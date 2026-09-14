import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { batteryTelemetry } from "../lib/game";
import { DEFAULT_ECONOMY as E } from "../lib/economy-config";

vi.mock("server-only", () => ({}));
import {
  getPreviewGameState,
  performPreviewGameAction,
  PREVIEW_GAME_COOKIE,
} from "../lib/preview-game";
import { gameActionSchema, HANDLED_ACTION_TYPES } from "../lib/game-server";

/**
 * `lib/game-server.ts` dan `lib/preview-game.ts` ditulis manual dan tidak
 * diturunkan satu sama lain -- lihat AGENTS.md. Perbedaan di antara keduanya
 * tidak menimbulkan error apa pun: produksi berperilaku satu cara, `pnpm dev`
 * berperilaku cara lain, dan yang ketahuan paling lama justru yang paling
 * menyesatkan. Berkas ini mengunci titik-titik yang pernah menyimpang.
 */
const gameServerSource = readFileSync("lib/game-server.ts", "utf8");
const previewSource = readFileSync("lib/preview-game.ts", "utf8");

const identity = {
  userId: `preview:${randomUUID()}`,
  displayName: "Preview Racer",
  username: "preview",
  photoUrl: null,
  startParam: null,
};
const request = (cookie?: string) =>
  new Request("http://localhost/api/game", {
    headers: cookie ? { cookie: `${PREVIEW_GAME_COOKIE}=${cookie}` } : {},
  });
const act = (
  cookie: string,
  command: Parameters<typeof performPreviewGameAction>[3],
  id = randomUUID(),
) => performPreviewGameAction(request(cookie), identity, id, command, E);
const onboarded = () =>
  act(getPreviewGameState(request(), identity, E).cookieValue, {
    type: "select-car",
    model: "luna-gt",
    color: "#b9a1ed",
  });

/** Pola yang sama dipakai withdrawal-policy.test.ts: lompati grinding koin. */
function fundedCookie(balance: number) {
  const fresh = getPreviewGameState(request(), identity, E);
  const decoded = JSON.parse(
    Buffer.from(fresh.cookieValue, "base64url").toString("utf8"),
  );
  decoded.state.balance = balance;
  decoded.state.carSelection = { model: "luna-gt", returningPlayer: false };
  decoded.state.color = "#b9a1ed";
  return Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url");
}

/**
 * Pola yang sama, untuk posisi lintasan: menempatkan mobil di tikungan dengan
 * benar-benar membalap ke sana butuh detik sungguhan, sedangkan yang diuji di
 * sini adalah keputusannya, bukan cara sampai ke posisi itu. `updatedAt`
 * disetel ke sekarang supaya penyelesaian tidak sempat menggeser posisinya.
 */
function cookieAtProgress(progress: number) {
  const decoded = JSON.parse(
    Buffer.from(fundedCookie(0), "base64url").toString("utf8"),
  );
  decoded.state.progress = progress;
  decoded.updatedAt = Date.now();
  return Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url");
}

describe("Setiap aksi server punya cabangnya di mode preview", () => {
  /**
   * Langkah 3 di AGENTS.md: aksi baru ditulis di `lib/game.ts`, `lib/game-server.ts`,
   * DAN `lib/preview-game.ts`. Melewatkan yang ketiga tidak menimbulkan error apa
   * pun -- aksinya cuma diam-diam tidak berfungsi saat `pnpm dev`, jebakan yang
   * paling lama ketahuan. Test ini memakai `commandSchema` sebagai sumbernya,
   * sama seperti tests/action-receipt-types.test.ts terhadap SQL.
   */
  const commandTypes = () => {
    const union = (
      gameActionSchema as never as {
        shape: { action: { options: { shape: { type: { value: string } } }[] } };
      }
    ).shape.action;
    return union.options.map((option) => option.shape.type.value).sort();
  };

  const previewBranches = () =>
    [
      ...new Set(
        [...previewSource.matchAll(/action\.type === "([a-z-]+)"/g)].map(
          ([, type]) => type,
        ),
      ),
    ].sort();

  it("tidak meninggalkan satu pun varian commandSchema tanpa cabang", () => {
    expect(previewBranches()).toEqual(commandTypes());
  });

  /**
   * Sisi server tidak perlu di-grep: peta handlernya diketik `{ [T in
   * GameCommand["type"]]: ... }`, jadi varian tanpa handler sudah gagal
   * kompilasi. Ini menegaskannya sekali lagi pada nilai yang sebenarnya.
   */
  it("memetakan setiap varian commandSchema ke handler server", () => {
    expect([...HANDLED_ACTION_TYPES].sort()).toEqual(commandTypes());
  });

  it("tidak menangani aksi yang tidak bisa diproduksi server", () => {
    const known = new Set(commandTypes());
    for (const type of previewBranches()) expect(known.has(type)).toBe(true);
  });
});

describe("Gaspol is retired in both writers", () => {
  it("rejects a legacy launch on both corners and straights", () => {
    for (const progress of [0.1, 0.45]) {
      expect(() => act(cookieAtProgress(progress), { type: "boost" })).toThrow("Gaspol sudah dihapus");
    }
    expect(gameServerSource).toContain('throw new GameRuleError("Gaspol sudah dihapus');
  });

  it("does not calculate or record new boost windows", () => {
    for (const source of [gameServerSource, previewSource]) {
      expect(source).not.toContain("boostDurationFor(");
      expect(source).not.toContain("isCleanBoostLaunch(");
      expect(source).not.toContain("recordDailyBoost(");
    }
  });

  it("clears old cookie timers without restoring boost availability", () => {
    const selected = onboarded();
    const fixture = JSON.parse(Buffer.from(selected.cookieValue, 'base64url').toString());
    fixture.state.boostLeft = 10;
    fixture.state.cooldown = 35;
    fixture.updatedAt = Date.now() - 1000;
    const result = getPreviewGameState(request(Buffer.from(JSON.stringify(fixture)).toString('base64url')), identity, E);
    expect(result.state).toMatchObject({ boostLeft: 0, cooldown: 0 });
    expect(result.state.boostLaunch).toBeUndefined();
    expect(batteryTelemetry(result.state).canBoost).toBe(false);
  });
});

describe("Circuit progression only moves forward", () => {
  it("keeps the higher-reward circuit after it has been selected", () => {
    const fresh = getPreviewGameState(request(), identity, E);
    const decoded = JSON.parse(
      Buffer.from(fresh.cookieValue, "base64url").toString("utf8"),
    );
    decoded.state.laps = 25;
    decoded.state.circuit = 0;
    decoded.state.carSelection = { model: "luna-gt", returningPlayer: false };
    decoded.state.color = "#b9a1ed";
    const eligibleCookie = Buffer.from(
      JSON.stringify(decoded),
      "utf8",
    ).toString("base64url");

    const advanced = act(eligibleCookie, { type: "circuit", circuit: 1 });
    expect(advanced.state.circuit).toBe(1);
    expect(() =>
      act(advanced.cookieValue, { type: "circuit", circuit: 0 }),
    ).toThrow("Trek lama tidak bisa dipilih lagi");
    // Masih dibaca dari source: sisi server butuh database untuk dijalankan
    // sungguhan, jadi arah perbandingannya belum bisa diuji seperti preview.
    expect(gameServerSource).toContain("action.circuit < row.circuit");
    expect(previewSource).toContain("action.circuit < state.circuit");
  });
});

describe("Repeating a settled action is a no-op in both writers", () => {
  it("accepts re-confirming the same car without resetting anything", () => {
    // Jaringan yang putus setelah server menyimpan membuat klien mencoba lagi
    // dengan requestId baru, dan tanda terima tidak mengenali percobaan itu.
    // Server dulu melempar 409 di sini sementara preview membiarkannya lewat.
    const selected = onboarded();
    const recolored = act(selected.cookieValue, {
      type: "color",
      color: "#e6a4ba",
    });
    const again = act(recolored.cookieValue, {
      type: "select-car",
      model: "luna-gt",
      color: "#b9a1ed",
    });
    expect(again.state.carSelection?.model).toBe("luna-gt");
    // Warna garasi yang dipilih belakangan tidak boleh tersetel ulang.
    expect(again.state.color).toBe("#e6a4ba");

    expect(gameServerSource).toContain("row.carModel !== action.model");
  });

  it("rejects a different car in both writers", () => {
    expect(() =>
      act(onboarded().cookieValue, {
        type: "select-car",
        model: "neo-falcon",
        color: "#4275ff",
      }),
    ).toThrow("Model sudah dikonfirmasi");
    expect(gameServerSource).toContain(
      "Model sudah dikonfirmasi dan tidak dapat diganti.",
    );
  });

  it("treats an already-claimed mission as nothing to do, not a failure", () => {
    // Preview dulu melempar "Target misi belum tercapai" untuk misi yang justru
    // sudah selesai -- pesan yang menuduh hal keliru, dan hanya di `pnpm dev`.
    // Tiga level ban pertama: 3.000 + 4.950 + 8.168 koin.
    let game = { cookieValue: fundedCookie(20_000) };
    for (let index = 0; index < 3; index += 1) {
      game = act(game.cookieValue, { type: "upgrade", key: "tires" });
    }
    const claimed = act(game.cookieValue, { type: "mission", id: "upgrade" });
    expect(claimed.state.missionsClaimed).toContain("upgrade");

    const repeated = act(claimed.cookieValue, { type: "mission", id: "upgrade" });
    expect(repeated.state.balance).toBe(claimed.state.balance);
    expect(repeated.state.missionsClaimed).toEqual(
      claimed.state.missionsClaimed,
    );
  });

  it("still refuses a mission whose target is genuinely unmet", () => {
    expect(() =>
      act(onboarded().cookieValue, { type: "mission", id: "laps" }),
    ).toThrow("Target misi belum tercapai");
  });
});
