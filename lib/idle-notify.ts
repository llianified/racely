import { formatDuration } from "./game";
import { OFFLINE_CAP_SECONDS } from "./game-economy";

/**
 * Bagian murni dari pemberitahuan idle: kapan seorang pemain layak dikirimi
 * pesan dan apa bunyinya. Dipisah dari I/O supaya bisa dites tanpa database
 * maupun Telegram.
 */

/** Sisa waktu saat pemain diingatkan, sebelum jendela offline penuh. */
export const IDLE_NOTIFY_LEAD_SECONDS = 30 * 60;
export const IDLE_NOTIFY_AFTER_SECONDS =
  OFFLINE_CAP_SECONDS - IDLE_NOTIFY_LEAD_SECONDS;

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
export function shouldNotifyIdle(candidate: IdleCandidate, now: Date) {
  if (!candidate.carModel) return false;
  if (idleSecondsOf(candidate, now) < IDLE_NOTIFY_AFTER_SECONDS) return false;
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
export function idleNotificationText(idleSeconds: number) {
  const remaining = OFFLINE_CAP_SECONDS - idleSeconds;
  return remaining > 0
    ? `Mobilmu berhenti ngumpulin koin ${formatDuration(remaining)} lagi. Buka Racely buat klaim hasil offline dan lanjut balapan.`
    : `Jendela offline ${formatDuration(OFFLINE_CAP_SECONDS)} sudah penuh — mobilmu berhenti ngumpulin koin. Buka Racely buat klaim hasilnya dan lanjut ngegas.`;
}
