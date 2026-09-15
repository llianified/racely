"use client";

import { Check, Gift, Link2, ListChecks, Lock, LockKeyhole, Send, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SectionCardHeading } from "../shell/section-card-heading";
import { StatHero } from "../shell/stat-hero";
import { CAR_CATALOG, STARTER_CAR_IDS, isReferralCar, type CarModelId } from "@/lib/car-catalog";
import { PAINT_CATALOG, type PaintId } from "@/lib/car-paints";
import { PART_CATALOG, type PartId } from "@/lib/car-parts";
import { coins, type GameCommand, type GameState } from "@/lib/game";
import { REFERRAL_MAX_FRIENDS, REFERRAL_MILESTONES, nextReferralMilestone, type ReferralMilestone } from "@/lib/referral-rewards";
import { cn } from "@/lib/utils";

/**
 * Milestone dibaca dari `referral.completed` (ajakan tuntas), bukan `invited`:
 * itu metrik yang sama yang dipakai server untuk membuka hadiahnya, jadi bar
 * di sini tidak pernah "penuh" sebelum tombolnya benar-benar bisa ditekan.
 *
 * Aksinya memakai perintah yang sudah ada -- equip-paint, equip-part,
 * select-car -- karena hadiah masuk koleksi saat pertama kali dipasang. Tidak
 * ada perintah "klaim" terpisah, dan tidak ada koin yang berpindah.
 */
function milestoneStatus(game: GameState, m: ReferralMilestone) {
  const model = game.carSelection?.model ?? null;
  if (m.kind === "paint") {
    const paint = PAINT_CATALOG[m.id as PaintId];
    return { owned: game.ownedPaints?.includes(m.id as PaintId) ?? false, active: game.color === paint.color, swatch: paint.color };
  }
  if (m.kind === "part") {
    const part = PART_CATALOG[m.id as PartId];
    return { owned: game.bodyParts?.owned.includes(m.id as PartId) ?? false, active: game.bodyParts?.equipped[part.slot] === m.id, swatch: null };
  }
  return { owned: model === m.id, active: model === m.id, swatch: null };
}

function milestoneCommand(game: GameState, m: ReferralMilestone): GameCommand {
  if (m.kind === "paint") return { type: "equip-paint", paintId: m.id as PaintId };
  if (m.kind === "part") return { type: "equip-part", partId: m.id as PartId };
  const model = m.id as CarModelId;
  return { type: "select-car", model, color: CAR_CATALOG[model].defaultColor };
}

export function ReferralPanel({
  game,
  onInvite,
  onReward,
  disabled = false,
}: {
  game: GameState;
  onInvite: () => void;
  onReward: (action: GameCommand) => Promise<boolean>;
  disabled?: boolean;
}) {
  const { referral, economy } = game;
  const completed = referral.completed;
  const next = nextReferralMilestone(completed);
  const currentModel = game.carSelection?.model ?? null;
  const onExclusiveCar = currentModel !== null && isReferralCar(currentModel);
  const steps = [
    { title: "Bagikan link", note: "Kirim ajakanmu langsung ke teman lewat Telegram." },
    { title: "Teman mulai balapan", note: `Dia membuka Racely dari link itu dan menyelesaikan ${economy.referralMilestoneLaps} putaran.` },
    { title: "Koin masuk", note: `Kamu ${coins(economy.referralRewardInviter)}, temanmu ${coins(economy.referralRewardInvitee)}. Langsung ke saldo, tanpa klaim.` },
    { title: "Hadiah eksklusif terbuka", note: "Cat, part, dan mobil yang tidak dijual di toko mana pun -- hanya lewat ajakan tuntas." },
  ];

  return (
    <div className="referral-layout section-enter flex flex-col gap-lg">
      <StatHero
        ariaLabel="Ringkasan ajak teman"
        label="Dari ajak teman"
        figure={referral.earned}
        action={
          <Button variant="gold" disabled={disabled || !referral.link} onClick={onInvite}>
            <Send data-icon="inline-start" />
            Bagikan ajakan
          </Button>
        }
        stats={[
          { label: "Ajakan tuntas", value: `${completed} teman` },
          { label: "Per teman", value: coins(economy.referralRewardInviter) },
        ]}
      />

      <section className="panel upgrade-panel" aria-label="Hadiah ajak teman">
        <SectionCardHeading
          icon={Gift}
          title="Hadiah eksklusif"
          aside={<Badge variant="secondary">{Math.min(completed, REFERRAL_MAX_FRIENDS)}/{REFERRAL_MAX_FRIENDS} teman</Badge>}
        />
        <div className="referral-progress">
          <Progress
            value={Math.min(100, (completed / REFERRAL_MAX_FRIENDS) * 100)}
            aria-label="Progres hadiah ajak teman"
            aria-valuetext={next ? `${completed} dari ${next.friends} teman untuk ${next.title}` : "Semua hadiah terbuka"}
          />
          <p className="setup-metric">
            {next
              ? <><b>{next.friends - completed} teman lagi</b> untuk {next.title}</>
              : <><Check aria-hidden="true" /><b>Semua hadiah terbuka.</b> Kamu pengajak sejati.</>}
          </p>
        </div>
        <ul className="upgrade-list" aria-label="Milestone hadiah">
          {REFERRAL_MILESTONES.map((m) => {
            const unlocked = completed >= m.friends;
            const { owned, active, swatch } = milestoneStatus(game, m);
            const isCar = m.kind === "car";
            const label = isCar ? (active ? "Dipakai" : owned ? "Pakai" : "Pakai") : active ? "Terpasang" : owned ? "Pasang" : "Pasang";
            return (
              <li key={`${m.kind}-${m.id}`} className={cn("upgrade-row referral-milestone", !unlocked && "is-locked", active && "is-active", unlocked && !owned && "is-ready")}>
                <div className="upgrade-head">
                  {swatch
                    ? <span className="upgrade-icon paint-swatch" style={{ backgroundColor: swatch }} aria-hidden="true" />
                    : <span className="upgrade-icon" aria-hidden="true">{unlocked ? <Gift /> : <Lock />}</span>}
                  <div className="upgrade-name">
                    <h3>{m.title}</h3>
                    <p className="setup-metric">
                      <b>{m.friends} teman</b>
                      <span aria-hidden="true"> · </span>
                      {unlocked ? (active ? "Sedang dipakai" : owned ? "Milikmu" : "Terbuka, belum dipasang") : `kurang ${m.friends - completed}`}
                    </p>
                  </div>
                  {active ? (
                    <Button variant="secondary" size="sm" className="upgrade-buy" disabled>
                      <Check data-icon="inline-start" aria-hidden="true" />
                      {label}
                    </Button>
                  ) : unlocked ? (
                    <Button
                      variant="goldSoft"
                      size="sm"
                      className="upgrade-buy"
                      disabled={disabled}
                      onClick={() => void onReward(milestoneCommand(game, m))}
                      aria-label={`${label} ${m.title}`}
                    >
                      {label}
                    </Button>
                  ) : (
                    <Button variant="secondary" size="sm" className="upgrade-buy" disabled aria-label={`${m.title} terkunci, butuh ${m.friends} teman`}>
                      <LockKeyhole data-icon="inline-start" aria-hidden="true" />
                      Terkunci
                    </Button>
                  )}
                </div>
                <p className="referral-milestone-note">{m.note}</p>
              </li>
            );
          })}
        </ul>
        {onExclusiveCar && (
          <div className="garage-parts-foot referral-switch-back">
            <p>Progres, koin, dan koleksi ikut ke mobil mana pun.</p>
            {STARTER_CAR_IDS.map((model) => (
              <Button
                key={model}
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => void onReward({ type: "select-car", model, color: CAR_CATALOG[model].defaultColor })}
              >
                Pakai {CAR_CATALOG[model].name}
              </Button>
            ))}
          </div>
        )}
      </section>

      <section className="panel referral-card" aria-label="Link ajakan">
        <SectionCardHeading icon={Link2} title="Link ajakan" />
        <code className="referral-link">{referral.link || "Link belum tersedia"}</code>
        <Button
          variant="outline"
          className="w-full"
          disabled={disabled || !referral.link}
          onClick={onInvite}
        >
          <UserPlus data-icon="inline-start" />
          Bagikan ke teman
        </Button>
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
