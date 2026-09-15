"use client";

import { ArrowUpRight, RadioTower, RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  RACELY_CHANNEL_URL,
  RACELY_CHANNEL_USERNAME,
} from "@/lib/racely-channel";
import { cn } from "@/lib/utils";
import { openTelegramLink } from "../use-telegram-webapp";
import { GateFrame } from "./gate-frame";

export function ChannelGate({
  checking,
  onCheck,
}: {
  checking: boolean;
  onCheck: () => void;
}) {
  return (
    <GateFrame
      titleId="channel-gate-title"
      label="Akses pembalap"
      status="Wajib gabung"
      icon={RadioTower}
      title={<>Satu langkah lagi.<br /><span>Lintasan menanti.</span></>}
      description="Gabung channel resmi untuk akses game, update balapan, dan info hadiah."
      actions={(
        <>
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
            <RefreshCw data-icon="inline-start" className={cn(checking && "motion-safe:animate-spin")} />
            {checking ? "Memeriksa keanggotaan…" : "Saya sudah bergabung"}
          </Button>
        </>
      )}
      note={checking
        ? "Sebentar, kami sedang memeriksa akun Telegrammu…"
        : "Sudah gabung? Kembali ke sini, lalu tekan tombol verifikasi."}
    >
      <ol className="gate-steps" aria-label="Cara membuka akses balapan">
        <li>
          <span className="gate-step-number" aria-hidden="true">01</span>
          <div>
            <p className="gate-step-title">Gabung {RACELY_CHANNEL_USERNAME}</p>
            <p className="gate-step-description">Tekan Gabung di channel Telegram.</p>
          </div>
        </li>
        <li>
          <span className="gate-step-number" aria-hidden="true">02</span>
          <div>
            <p className="gate-step-title">Verifikasi, lalu mulai balapan</p>
            <p className="gate-step-description">Kembali dan tekan “Saya sudah bergabung”.</p>
          </div>
        </li>
      </ol>
    </GateFrame>
  );
}
