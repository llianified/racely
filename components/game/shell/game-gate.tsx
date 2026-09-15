import { ArrowUpRight, RefreshCw, Send, ShieldCheck, WifiOff } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { GateFrame } from "./gate-frame";

/**
 * Terminal screen for a session that cannot be recovered in place: the retry
 * button only appears when retrying can actually help, otherwise the only way
 * back is a freshly signed initData from Telegram.
 */
export function GameGate({
  error,
  onRetry,
  retrying = false,
}: {
  error: Error;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <>
      <Toaster theme="dark" position="top-center" />
      <GateFrame
        titleId="gate-title"
        label={onRetry ? "Jeda di pit stop" : "Akses pembalap"}
        status={onRetry ? "Sinkronisasi" : "Telegram"}
        icon={onRetry ? WifiOff : Send}
        title={onRetry ? (
          <>Pit stop sebentar.<br /><span>Sambungkan lagi.</span></>
        ) : (
          <>Balapanmu dimulai<br /><span>dari Telegram.</span></>
        )}
        description={onRetry
          ? "Progresmu belum bisa dimuat. Coba sinkronkan lagi untuk melanjutkan balapan."
          : "Buka Racely dari bot resmi untuk menghubungkan akun dan melanjutkan balapanmu."}
        actions={onRetry ? (
          <Button
            variant="gold"
            size="lg"
            className="w-full whitespace-normal"
            onClick={onRetry}
            disabled={retrying}
            aria-busy={retrying}
          >
            <RefreshCw data-icon="inline-start" className={cn(retrying && "motion-safe:animate-spin")} />
            {retrying ? "Menyinkronkan…" : "Coba sinkronkan lagi"}
          </Button>
        ) : (
          <a
            href="https://t.me/RacelyBot?startapp=play"
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "gold", size: "lg", className: "w-full whitespace-normal" })}
          >
            Buka @RacelyBot
            <ArrowUpRight data-icon="inline-end" />
          </a>
        )}
        note={retrying
          ? "Sedang menyambungkan kembali progresmu…"
          : onRetry
            ? "Pastikan koneksimu aktif, lalu coba lagi."
            : "Sudah di Telegram? Tutup Mini App, lalu buka lagi dari bot."}
      >
        <div className="gate-session">
          <ShieldCheck aria-hidden="true" />
          <div>
            <p className="gate-session-title">{onRetry ? "Lanjut dari progres terakhir" : "Satu akun. Semua progresmu."}</p>
            <p className="gate-session-description">{onRetry
              ? "Koin, level, dan mobil yang tersimpan tetap terhubung ke akunmu."
              : "Garasi, koin, dan level terhubung ke akun Telegram yang kamu gunakan."}</p>
          </div>
        </div>
        <details className="gate-details">
          <summary>{onRetry ? "Kenapa belum tersambung?" : "Kenapa harus membuka ulang?"}</summary>
          <p>{error.message}</p>
        </details>
      </GateFrame>
    </>
  );
}
