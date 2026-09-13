import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { batteryTelemetry, boostCooldownSeconds } from "../lib/game";
import { DEFAULT_ECONOMY } from "../lib/economy-config";

/**
 * Timing boost sekarang datang dari config ekonomi, bukan konstanta modul.
 * Test ini mengunci nilai BAWAAN-nya dan -- lebih penting -- tetap mengunci
 * bahwa kedua penulis membaca config itu, bukan milidetik yang ditulis lepas.
 */
const E = DEFAULT_ECONOMY;
const BOOST_DURATION_SECONDS = E.boostDurationSeconds;
const BATTERY_RECHARGE_SECONDS = E.batteryRechargeSeconds;
const BOOST_COOLDOWN_SECONDS = boostCooldownSeconds(E);

vi.mock("server-only", () => ({}));
import {
  getPreviewGameState,
  performPreviewGameAction,
  PREVIEW_GAME_COOKIE,
} from "../lib/preview-game";
import { gameActionSchema } from "../lib/game-server";

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

  it("tidak menangani aksi yang tidak bisa diproduksi server", () => {
    const known = new Set(commandTypes());
    for (const type of previewBranches()) expect(known.has(type)).toBe(true);
  });
});

describe("Boost timing has one source of truth", () => {
  it("derives the cooldown from the duration and the recharge", () => {
    expect(BOOST_COOLDOWN_SECONDS).toBe(
      BOOST_DURATION_SECONDS + BATTERY_RECHARGE_SECONDS,
    );
  });

  it("leaves the battery meter honest for the whole cycle", () => {
    // Meteran membaca sisa cooldown sebagai sisa pengisian. Kalau cooldown
    // bukan durasi + isi ulang, persennya keluar jalur di salah satu fase.
    const justBoosted = batteryTelemetry({
      boostLeft: BOOST_DURATION_SECONDS,
      cooldown: BOOST_COOLDOWN_SECONDS,
      economy: E,
    });
    expect(justBoosted.phase).toBe("discharging");
    expect(justBoosted.percent).toBe(100);

    const boostSpent = batteryTelemetry({
      boostLeft: 0,
      cooldown: BATTERY_RECHARGE_SECONDS,
      economy: E,
    });
    expect(boostSpent.phase).toBe("charging");
    expect(boostSpent.percent).toBe(0);
    expect(boostSpent.canBoost).toBe(false);

    const recharged = batteryTelemetry({ boostLeft: 0, cooldown: 0, economy: E });
    expect(recharged.phase).toBe("ready");
    expect(recharged.percent).toBe(100);
    expect(recharged.canBoost).toBe(true);
  });

  it("keeps both writers off hardcoded milliseconds", () => {
    // Server pernah memakai 10_000 / 35_000 dan preview 10 / 35, sementara
    // konstanta di lib/game.ts hanya dibaca UI -- mengubah konstanta itu tidak
    // mengubah permainan sama sekali, hanya membuat meterannya berbohong.
    for (const source of [gameServerSource, previewSource]) {
      // Nama berubah saat timing boost pindah ke config; yang dijaga tetap
      // sama: keduanya membaca satu sumber, bukan angka yang ditulis lepas.
      expect(source).toContain("economy.boostDurationSeconds");
      expect(source).toContain("boostCooldownSeconds(");
    }
    expect(gameServerSource).not.toContain("35_000");
  });

  it("hands the preview the same boost window the server writes", () => {
    const boosted = act(onboarded().cookieValue, { type: "boost" });
    expect(boosted.state.boostLeft).toBe(BOOST_DURATION_SECONDS);
    expect(boosted.state.cooldown).toBe(BOOST_COOLDOWN_SECONDS);
    expect(() => act(boosted.cookieValue, { type: "boost" })).toThrow(
      "Boost masih mengisi ulang",
    );
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
    expect(gameServerSource).toContain("action.circuit < next.circuit");
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

    expect(gameServerSource).toContain("next.carModel !== action.model");
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
    let game = { cookieValue: fundedCookie(500) };
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
