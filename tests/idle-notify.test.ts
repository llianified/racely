import { describe, expect, it } from "vitest";
import {
  idleNotifyAfterSeconds,
  IDLE_NOTIFY_LEAD_SECONDS,
  idleNotificationText,
  idleSecondsOf,
  shouldNotifyIdle,
} from "../lib/idle-notify";
import { DEFAULT_ECONOMY } from "../lib/economy-config";

/** Ambang idle turunan dari jendela offline, yang sekarang bisa disetel. */
const E = DEFAULT_ECONOMY;
const AFTER = idleNotifyAfterSeconds(E);

const now = new Date("2026-09-12T12:00:00.000Z");
const agoSeconds = (seconds: number) => new Date(now.getTime() - seconds * 1000);
const kandidat = (over: Partial<Parameters<typeof shouldNotifyIdle>[0]> = {}) => ({
  carModel: "luna-gt" as string | null,
  lastSettledAt: agoSeconds(AFTER),
  idleNotifiedAt: null as Date | null,
  ...over,
});

describe("Pemberitahuan idle", () => {
  it("mengingatkan tepat setengah jam sebelum jendela offline penuh", () => {
    expect(IDLE_NOTIFY_LEAD_SECONDS).toBe(30 * 60);
    expect(AFTER).toBe(E.offlineCapSeconds - 30 * 60);
    expect(shouldNotifyIdle(kandidat(), now, E)).toBe(true);
    expect(
      shouldNotifyIdle(
        kandidat({ lastSettledAt: agoSeconds(AFTER - 1) }), now, E),
    ).toBe(false);
  });

  it("melewatkan pemain yang belum memilih mobil", () => {
    // Tanpa mobil tidak ada koin yang terkumpul, jadi tidak ada yang hilang.
    expect(shouldNotifyIdle(kandidat({ carModel: null }), now, E)).toBe(false);
  });

  it("hanya mengirim satu pesan per periode menganggur", () => {
    const sudah = kandidat({
      lastSettledAt: agoSeconds(E.offlineCapSeconds),
      idleNotifiedAt: agoSeconds(IDLE_NOTIFY_LEAD_SECONDS),
    });
    expect(shouldNotifyIdle(sudah, now, E)).toBe(false);
  });

  it("layak lagi setelah pemain kembali dan menganggur ulang", () => {
    // Pemain kembali (last_settled_at melompat ke depan) lalu pergi lagi;
    // tanda notifikasi lama kini lebih tua daripada penyelesaian terakhir.
    const kembaliLaluPergi = kandidat({
      lastSettledAt: agoSeconds(AFTER),
      idleNotifiedAt: agoSeconds(E.offlineCapSeconds * 2),
    });
    expect(shouldNotifyIdle(kembaliLaluPergi, now, E)).toBe(true);
  });

  it("menyesuaikan teks kalau penyapu terlambat dan jendelanya sudah penuh", () => {
    expect(idleNotificationText(AFTER, E)).toContain("30 menit lagi");
    const telat = idleNotificationText(E.offlineCapSeconds + 3600, E);
    expect(telat).toContain("sudah penuh");
    expect(telat).not.toContain("lagi.");
  });

  it("tidak pernah menghitung waktu menganggur negatif", () => {
    const masaDepan = kandidat({ lastSettledAt: new Date(now.getTime() + 60_000) });
    expect(idleSecondsOf(masaDepan, now)).toBe(0);
    expect(shouldNotifyIdle(masaDepan, now, E)).toBe(false);
  });
});
