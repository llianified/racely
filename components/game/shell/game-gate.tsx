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
}: {
  error: Error;
  onRetry?: () => void;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-center text-foreground">
      <Toaster theme="dark" position="top-center" />
      <section className="panel flex w-full max-w-md flex-col items-center gap-5 p-8">
        <Image
          src="/racely-logo.png"
          alt="Logo Racely"
          width={96}
          height={96}
          priority
          className="gate-logo"
        />
        <div>
          <p className="eyebrow">RACELY TELEGRAM MINI APP</p>
          <h1 className="mt-2 text-2xl font-semibold">
            Start your engine in Telegram.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {error.message}
          </p>
        </div>
        {onRetry ? (
          <Button variant="gold" size="lg" className="w-full" onClick={onRetry}>
            Coba sinkronkan lagi
          </Button>
        ) : (
          <a
            href="https://t.me/RacelyBot?startapp=play"
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "gold", size: "lg", className: "w-full" })}
          >
            Buka @RacelyBot
            <ArrowUpRight data-icon="inline-end" />
          </a>
        )}
      </section>
    </main>
  );
}
