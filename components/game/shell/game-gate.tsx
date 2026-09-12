import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

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
    <main className="game-gate font-sans">
      <Toaster theme="dark" position="top-center" />
      <section className="panel gate-panel" aria-labelledby="gate-title">
        <Image
          src="/racely-logo.png"
          alt="Logo Racely"
          width={372}
          height={248}
          priority
          className="gate-logo"
        />
        <div className="gate-copy">
          <p className="boot-eyebrow">RACELY TELEGRAM MINI APP</p>
          <h1 id="gate-title" className="text-3xl text-balance">
            {onRetry ? "Progres belum bisa dimuat" : "Buka Racely lewat Telegram"}
          </h1>
          <p role="status" className="text-read leading-relaxed text-muted-foreground">
            {retrying ? "Sedang menyinkronkan progresmu…" : error.message}
          </p>
        </div>
        {onRetry ? (
          <Button variant="gold" size="lg" className="w-full whitespace-normal" onClick={onRetry} disabled={retrying} aria-busy={retrying}>
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
      </section>
    </main>
  );
}
