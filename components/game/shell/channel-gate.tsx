"use client";

import Image from "next/image";
import { ArrowUpRight, RadioTower, RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  RACELY_CHANNEL_URL,
  RACELY_CHANNEL_USERNAME,
} from "@/lib/racely-channel";
import { openTelegramLink } from "../use-telegram-webapp";

export function ChannelGate({
  checking,
  onCheck,
}: {
  checking: boolean;
  onCheck: () => void;
}) {
  return (
    <main className="game-gate font-sans">
      <section className="panel gate-panel" aria-labelledby="channel-gate-title">
        <Image
          src="/racely-logo.png"
          alt="Logo Racely"
          width={372}
          height={248}
          priority
          className="gate-logo"
        />
        <div className="gate-copy">
          <p className="boot-eyebrow">SATU LANGKAH SEBELUM BALAPAN</p>
          <h1 id="channel-gate-title" className="text-3xl text-balance">
            Gabung channel Racely
          </h1>
          <p className="text-read leading-relaxed text-muted-foreground">
            Gabung channel resmi untuk membuka game, update balapan, dan info
            hadiah terbaru.
          </p>
        </div>

        <div className="channel-task">
          <span className="channel-task-icon" aria-hidden="true">
            <RadioTower />
          </span>
          <div className="channel-task-copy">
            <p className="channel-task-title">Gabung channel resmi</p>
            <p className="channel-task-description">
              Ikuti {RACELY_CHANNEL_USERNAME}, lalu kembali ke sini untuk
              verifikasi otomatis.
            </p>
          </div>
          <span className="channel-task-status">WAJIB</span>
        </div>

        <div className="gate-actions">
          <a
            href={RACELY_CHANNEL_URL}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({
              variant: "gold",
              size: "lg",
              className: "w-full whitespace-normal",
            })}
            onClick={(event) => {
              if (openTelegramLink(RACELY_CHANNEL_URL)) event.preventDefault();
            }}
          >
            Gabung {RACELY_CHANNEL_USERNAME}
            <ArrowUpRight data-icon="inline-end" />
          </a>
          <Button
            variant="outline"
            size="lg"
            className="w-full whitespace-normal"
            onClick={onCheck}
            disabled={checking}
            aria-busy={checking}
          >
            <RefreshCw
              data-icon="inline-start"
              className={checking ? "animate-spin" : undefined}
            />
            {checking ? "Memeriksa keanggotaan…" : "Saya sudah bergabung"}
          </Button>
        </div>
        <p className="channel-gate-note" role="status" aria-live="polite">
          {checking
            ? "Tunggu sebentar, Racely sedang memeriksa akun Telegrammu."
            : "Setelah bergabung, tekan tombol verifikasi di atas."}
        </p>
      </section>
    </main>
  );
}
