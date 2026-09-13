"use client";

import { Copy, Link2, ListChecks, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoHint } from "./info-hint";
import { SectionCardHeading } from "../shell/section-card-heading";
import { StatHero } from "../shell/stat-hero";
import { coins, formatCoins, type GameState } from "@/lib/game";

export function ReferralPanel({
  game,
  onInvite,
  onCopy,
  disabled = false,
}: {
  game: GameState;
  /** Membuka dialog bagikan Telegram; di luar Telegram jatuh ke salin link. */
  onInvite: () => void;
  onCopy: () => void;
  disabled?: boolean;
}) {
  const { referral, economy } = game;
  const steps = [
    { title: "Bagikan link", note: "Satu tap kirim ajakanmu ke kontak atau grup Telegram." },
    { title: "Teman mulai balapan", note: `Dia membuka Racely dari link itu dan menyelesaikan ${economy.referralMilestoneLaps} putaran.` },
    { title: "Koin masuk", note: `Kamu ${coins(economy.referralRewardInviter)}, temanmu ${coins(economy.referralRewardInvitee)}. Langsung ke saldo, tanpa klaim.` },
  ];

  return (
    <div className="referral-layout section-enter flex flex-col gap-lg">
      <StatHero
        ariaLabel="Ringkasan ajak teman"
        label="Dari ajak teman"
        figure={formatCoins(referral.earned)}
        info={
          <InfoHint title="Tentang ajak teman">
            Koin dihitung saat temanmu benar-benar main, bukan saat daftar.
            Tidak ada batas jumlah teman.
          </InfoHint>
        }
        action={
          <Button variant="gold" disabled={disabled || !referral.link} onClick={onInvite}>
            <Send data-icon="inline-start" />
            Bagikan ke Telegram
          </Button>
        }
        stats={[
          { label: "Teman diajak", value: `${referral.invited} orang` },
          { label: "Per teman", value: coins(economy.referralRewardInviter) },
        ]}
      />

      <section className="panel referral-card" aria-label="Link ajakan">
        <SectionCardHeading icon={Link2} title="Link ajakan" />
        <code className="referral-link">{referral.link || "Link belum tersedia"}</code>
        <div className="flex flex-col gap-sm">
          <Button
            variant="gold"
            className="w-full"
            disabled={disabled || !referral.link}
            onClick={onInvite}
          >
            <Send data-icon="inline-start" />
            Bagikan ke Telegram
          </Button>
          <Button
            variant="outline"
            className="w-full"
            disabled={disabled || !referral.link}
            onClick={onCopy}
          >
            <Copy data-icon="inline-start" />
            Salin link
          </Button>
        </div>
      </section>

      <section className="panel referral-card" aria-label="Cara kerja ajak teman">
        <SectionCardHeading icon={ListChecks} title="Cara kerja" />
        <ol className="referral-steps">
          {steps.map((step, index) => (
            <li key={step.title}>
              <span aria-hidden="true">{index + 1}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.note}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
