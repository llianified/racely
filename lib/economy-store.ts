import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { economyConfig } from "@/lib/db/schema";
import {
  DEFAULT_ECONOMY,
  economyConfigSchema,
  resolveEconomyConfig,
  type EconomyConfig,
} from "@/lib/economy-config";

const CONFIG_ID = "default";

/**
 * Config ekonomi dibaca di setiap penyelesaian balapan, jadi ia tidak boleh
 * menambah satu query ke tiap aksi pemain. Cache-nya di dalam proses -- aman
 * karena alasan yang sama dengan rate limiter dan dedupe webhook: PM2 mengunci
 * Racely ke `instances: 1, exec_mode: "fork"`. Kalau instance ditambah,
 * penyimpanan dari panel hanya akan terlihat di proses yang melayaninya sampai
 * TTL habis; pindahkan invalidasi ke Postgres LISTEN/NOTIFY atau Redis lebih
 * dulu.
 *
 * TTL tetap ada di samping invalidasi eksplisit supaya perubahan yang ditulis
 * langsung ke database (psql, atau proses lain) tetap terbaca tanpa restart.
 */
const CACHE_TTL_MS = 30_000;

const globalForEconomy = globalThis as unknown as {
  racelyEconomyCache?: { value: EconomyConfig; readAt: number };
};

/** Dipakai test dan penyimpanan config; membuat pembacaan berikutnya menembus cache. */
export function resetEconomyCache() {
  globalForEconomy.racelyEconomyCache = undefined;
}

/**
 * Tanpa `DATABASE_URL` -- test dan sebagian `pnpm dev` -- tidak ada tempat
 * menyimpan config, jadi default yang dipakai. Kegagalan query juga jatuh ke
 * default: ekonomi yang memakai angka bawaan jauh lebih baik daripada
 * permainan yang mati total karena satu baris config tak terbaca.
 */
export async function readEconomyConfig(
  now = Date.now(),
): Promise<EconomyConfig> {
  const cached = globalForEconomy.racelyEconomyCache;
  if (cached && now - cached.readAt < CACHE_TTL_MS) return cached.value;
  if (!db) return DEFAULT_ECONOMY;

  try {
    const [row] = await db
      .select({ config: economyConfig.config })
      .from(economyConfig)
      .where(eq(economyConfig.id, CONFIG_ID))
      .limit(1);
    const value = resolveEconomyConfig(row?.config);
    globalForEconomy.racelyEconomyCache = { value, readAt: now };
    return value;
  } catch {
    return cached?.value ?? DEFAULT_ECONOMY;
  }
}

export type EconomyConfigSnapshot = {
  config: EconomyConfig;
  updatedAt: string | null;
  updatedBy: string | null;
  /** True selama belum ada yang menyimpan apa pun: yang berlaku adalah default. */
  usingDefaults: boolean;
};

/** Dipakai panel admin: config plus dari mana asalnya. */
export async function readEconomyConfigSnapshot(): Promise<EconomyConfigSnapshot> {
  if (!db) {
    return {
      config: DEFAULT_ECONOMY,
      updatedAt: null,
      updatedBy: null,
      usingDefaults: true,
    };
  }
  const [row] = await db
    .select()
    .from(economyConfig)
    .where(eq(economyConfig.id, CONFIG_ID))
    .limit(1);
  return {
    config: resolveEconomyConfig(row?.config),
    updatedAt: row?.updatedAt?.toISOString() ?? null,
    updatedBy: row?.updatedBy ?? null,
    usingDefaults: !row,
  };
}

export class EconomyConfigError extends Error {
  constructor(
    message: string,
    public issues: string[] = [],
  ) {
    super(message);
    this.name = "EconomyConfigError";
  }
}

/**
 * Menyimpan config utuh. Menerima objek lengkap, bukan tambalan: menyetel
 * ekonomi sebagian membuat dua penyimpanan bersamaan saling menimpa field yang
 * tidak mereka sentuh, dan itu jenis kerusakan yang tidak terlihat sampai ada
 * yang menghitung koinnya.
 */
export async function writeEconomyConfig(
  candidate: unknown,
  actor: string,
): Promise<EconomyConfig> {
  const parsed = economyConfigSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new EconomyConfigError(
      "Config ekonomi tidak valid.",
      parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "config"}: ${issue.message}`,
      ),
    );
  }
  if (!db) throw new EconomyConfigError("DATABASE_URL belum dikonfigurasi.");

  await db
    .insert(economyConfig)
    .values({
      id: CONFIG_ID,
      config: parsed.data,
      updatedAt: new Date(),
      updatedBy: actor,
    })
    .onConflictDoUpdate({
      target: economyConfig.id,
      set: {
        config: parsed.data,
        updatedAt: new Date(),
        updatedBy: actor,
      },
    });

  resetEconomyCache();
  return parsed.data;
}
