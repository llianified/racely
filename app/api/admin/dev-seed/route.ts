import { randomUUID } from "node:crypto";
import { ADMIN_ACTOR, adminJson, guardAdmin } from "@/lib/admin-api";
import { recordAudit } from "@/lib/admin-ops";
import { db } from "@/lib/db";
import { players, withdrawals } from "@/lib/db/schema";
import { readEconomyConfig } from "@/lib/economy-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Menyuntik satu pemain palsu beserta penarikan 'pending'.
 *
 * Ada karena menguji antrean membutuhkan antrean: tanpa ini satu-satunya cara
 * melihat panel dengan data sungguhan adalah membuat akun Telegram baru,
 * menggiling koin sampai batas minimum, lalu mengajukan penarikan -- untuk
 * setiap perubahan tata letak.
 *
 * Dijaga dua lapis: sesi admin yang sah, DAN `NODE_ENV !== "production"`.
 * Lapisan kedua itu yang penting -- endpoint ini mencetak kewajiban rupiah dari
 * udara, jadi ia tidak boleh bisa dijangkau di EC2 bahkan oleh operator yang
 * sudah masuk.
 */
export async function POST(request: Request) {
  const denied = guardAdmin(request, { mutating: true });
  if (denied) return denied;

  if (process.env.NODE_ENV === "production") {
    return adminJson(
      { error: "Seed hanya tersedia di luar produksi." },
      403,
    );
  }
  if (!db) {
    return adminJson({ error: "DATABASE_URL belum dikonfigurasi." }, 503);
  }

  const economy = await readEconomyConfig();
  const suffix = randomUUID().slice(0, 8);
  const userId = `dev-seed-${suffix}`;
  const coins = economy.minWithdrawCoins;

  await db.insert(players).values({
    userId,
    telegramUsername: `seed_${suffix}`,
    displayName: `Seed Racer ${suffix}`,
    photoUrl: null,
    balance: coins * 3,
    carModel: "luna-gt",
    color: "#b9a1ed",
    laps: 250,
    earned: coins * 3,
  });

  const [created] = await db
    .insert(withdrawals)
    .values({
      userId,
      requestId: randomUUID(),
      coins,
      amountIdr: coins * economy.coinToIdr,
      method: "dana",
      account: "081234567890",
      accountName: `Seed Racer ${suffix}`,
    })
    .returning({ id: withdrawals.id });

  await recordAudit({
    actor: ADMIN_ACTOR,
    action: "dev:seed",
    target: String(created?.id ?? ""),
    detail: { userId, coins },
  });

  return adminJson({ userId, withdrawalId: String(created?.id ?? ""), coins });
}
