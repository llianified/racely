import { formatDuration } from "./game";
import type { EconomyConfig } from "./economy-config";

/**
 * Bagian murni dari pemberitahuan idle: kapan seorang pemain layak dikirimi
 * pesan dan apa bunyinya. Dipisah dari I/O supaya bisa dites tanpa database
 * maupun Telegram.
 */

/** Sisa waktu saat pemain diingatkan, sebelum jendela offline penuh. */
export const IDLE_NOTIFY_LEAD_SECONDS = 30 * 60;

/**
 * Turunan dari jendela offline, yang sekarang bisa disetel dari panel admin --
 * jadi ini fungsi, bukan konstanta. Dijaga tidak negatif: jendela offline yang
 * disetel lebih pendek dari lead time akan membuat ambangnya minus, dan setiap
 * pemain langsung dianggap layak dikirimi pesan.
 */
export const idleNotifyAfterSeconds = (e: EconomyConfig) =>
  Math.max(0, e.offlineCapSeconds - IDLE_NOTIFY_LEAD_SECONDS);

export type IdleCandidate = {
  /** Pemain yang belum memilih mobil tidak pernah mengumpulkan koin. */
  carModel: string | null;
  lastSettledAt: Date;
  idleNotifiedAt: Date | null;
};

export function idleSecondsOf(candidate: IdleCandidate, now: Date) {
  return Math.max(0, (now.getTime() - candidate.lastSettledAt.getTime()) / 1000);
}

/**
 * Satu pesan per periode menganggur. `idleNotifiedAt < lastSettledAt` adalah
 * kuncinya: begitu pemain kembali dan hasilnya diselesaikan, last_settled_at
 * melompat melewati tanda notifikasi dan periode berikutnya layak lagi.
 */
export function shouldNotifyIdle(
  candidate: IdleCandidate,
  now: Date,
  e: EconomyConfig,
) {
  if (!candidate.carModel) return false;
  if (idleSecondsOf(candidate, now) < idleNotifyAfterSeconds(e)) return false;
  return (
    candidate.idleNotifiedAt === null ||
    candidate.idleNotifiedAt.getTime() < candidate.lastSettledAt.getTime()
  );
}

/**
 * Penyapu bisa terlambat -- proses mati, deploy, atau antrean panjang -- jadi
 * teksnya menyesuaikan: mengingatkan kalau masih sempat, memberi tahu kalau
 * jendelanya sudah penuh. Keduanya tetap mengajak balik, bukan menyalahkan.
 */
export function idleNotificationText(idleSeconds: number, e: EconomyConfig) {
  const remaining = e.offlineCapSeconds - idleSeconds;
  return remaining > 0
    ? `Mobilmu berhenti ngumpulin koin ${formatDuration(remaining)} lagi. Buka Racely buat klaim hasil offline dan lanjut balapan.`
    : `Jendela offline ${formatDuration(e.offlineCapSeconds)} sudah penuh — mobilmu berhenti ngumpulin koin. Buka Racely buat klaim hasilnya dan lanjut ngegas.`;
}
