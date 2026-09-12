/**
 * Dijalankan sekali saat server Node menyala. Di sinilah penyapu pemberitahuan
 * idle dinyalakan -- lihat `lib/idle-notifier.ts` untuk alasan kenapa penjadwal
 * di dalam proses aman di sini (PM2 dikunci ke satu instance).
 */
export async function register() {
  // Runtime edge tidak punya timer panjang maupun akses Postgres, dan fase
  // build juga memanggil register().
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { startIdleNotifier } = await import("@/lib/idle-notifier");
  startIdleNotifier();
}
