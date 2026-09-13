"use client";

import { CalendarCheck, Check, Coins, Copy, Flag, Gift, LockKeyhole, Trophy, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { InfoHint } from "./info-hint";
import { SectionCardHeading } from "../shell/section-card-heading";
import { cn } from "@/lib/utils";
import {
  coins,
  formatCoins,
  missions,
  missionValue,
  type GameState,
  type MissionId,
} from "@/lib/game";

type RewardRow = {
  id: string;
  icon: typeof Gift;
  label: string;
  note: string;
  amount: number;
  state: "ready" | "waiting" | "claimed";
  progress?: { value: number; target: number };
  onClaim: () => void;
};

export function claimableTotal(game: GameState) {
  const missionTotal = missions(game.economy)
    .filter(
      (m) => !game.missionsClaimed.includes(m.id) && missionValue(game, m.id) >= m.target,
    )
    .reduce((sum, m) => sum + m.reward, 0);
  // Only whole coins can move from pending into the balance.
  return (
    Math.floor(game.pending) +
    (game.rewardClaimed ? 0 : game.economy.starterGift) +
    game.daily.reward +
    missionTotal
  );
}

/** Panjang tangga hadiah ikut config, jadi kalimatnya tidak boleh menyebut 7 sendiri. */
function dailyNote(daily: GameState["daily"], economy: GameState["economy"]) {
  if (daily.claimedToday)
    return daily.streak > 1
      ? `Streak ${daily.streak} hari. Balik besok untuk ${coins(daily.nextReward)}.`
      : `Sudah diklaim hari ini. Besok ${coins(daily.nextReward)}.`;
  if (daily.streak > 0)
    return `Streak ${daily.streak} hari berjalan. Klaim hari ini supaya tidak putus.`;
  const rungs = economy.dailyRewards.length;
  return rungs > 1
    ? `Klaim tiap hari; hadiahnya naik sampai hari ke-${rungs}.`
    : "Klaim tiap hari untuk tambahan koin.";
}

function ReferralCard({
  referral,
  economy,
  onInvite,
  disabled,
}: {
  referral: GameState["referral"];
  economy: GameState["economy"];
  onInvite: () => void;
  disabled: boolean;
}) {
  return (
    <section className="panel referral-card" aria-label="Ajak teman">
      <SectionCardHeading
        icon={UserPlus}
        title="Ajak teman"
        aside={
          <Badge variant="secondary">
            {referral.invited} diajak · {coins(referral.earned)} didapat
          </Badge>
        }
      />
      <p className="referral-note">
        Kamu dapat {coins(economy.referralRewardInviter)} dan temanmu{" "}
        {coins(economy.referralRewardInvitee)} begitu dia menyelesaikan{" "}
        {economy.referralMilestoneLaps} putaran. Koinnya masuk saat dia benar-benar
        main, bukan saat daftar.
      </p>
      <code className="referral-link">{referral.link}</code>
      <Button
        variant="outline"
        className="w-full"
        disabled={disabled || !referral.link}
        onClick={onInvite}
      >
        <Copy data-icon="inline-start" />
        Salin link ajakan
      </Button>
    </section>
  );
}

export function RewardsPanel({
  game,
  onClaimRace,
  onClaimDaily,
  onClaimGift,
  onClaimMission,
  onClaimAll,
  onInvite,
  disabled = false,
}: {
  game: GameState;
  onClaimRace: () => void;
  onClaimDaily: () => void;
  onClaimGift: () => void;
  onClaimMission: (id: MissionId) => void;
  onClaimAll: () => void;
  onInvite: () => void;
  disabled?: boolean;
}) {
  const total = claimableTotal(game);
  const rows: RewardRow[] = [
    {
      id: "race",
      icon: Flag,
      label: "Hasil balapan",
      note:
        game.pending >= 1
          ? "Koin dari putaran yang sudah selesai"
          : `Terkumpul ${coins(game.pending)} · butuh 1 koin penuh`,
      amount: Math.floor(game.pending),
      state: game.pending >= 1 ? "ready" : "waiting",
      onClaim: onClaimRace,
    },
    {
      id: "daily",
      icon: CalendarCheck,
      label: "Check-in harian",
      note: dailyNote(game.daily, game.economy),
      amount: game.daily.claimedToday ? game.daily.nextReward : game.daily.reward,
      state: game.daily.claimedToday ? "claimed" : "ready",
      onClaim: onClaimDaily,
    },
    {
      id: "gift",
      icon: Gift,
      label: "Bonus starter",
      note: game.rewardClaimed ? "Bonus sudah masuk ke saldo kamu." : "Hadiah pertamamu. Sekali klaim, langsung masuk saldo.",
      amount: game.economy.starterGift,
      state: game.rewardClaimed ? "claimed" : "ready",
      onClaim: onClaimGift,
    },
    ...missions(game.economy).map((mission) => {
      const value = Math.min(mission.target, missionValue(game, mission.id));
      const claimed = game.missionsClaimed.includes(mission.id);
      return {
        id: mission.id,
        icon: Trophy,
        label: mission.title,
        note: mission.description,
        amount: mission.reward,
        state: claimed ? "claimed" : value >= mission.target ? "ready" : "waiting",
        progress: value >= mission.target ? undefined : { value, target: mission.target },
        onClaim: () => onClaimMission(mission.id),
      } satisfies RewardRow;
    }),
  ];
  const readyCount = rows.filter((row) => row.state === "ready").length;

  return (
    <div className="rewards-layout section-enter flex flex-col gap-lg">
      <section className="rewards-hero" aria-label="Total hadiah siap diklaim">
        <div className="rewards-hero-copy">
          <span className="eyebrow">Siap diklaim</span>
          <strong>{formatCoins(total)} <span>koin</span></strong>
        </div>
        <Button
          variant="gold"
          size="lg"
          className="w-full"
          disabled={disabled || total <= 0}
          onClick={onClaimAll}
        >
          <Coins data-icon="inline-start" />
          Klaim semua
        </Button>
        <div className="rewards-hero-side">
          <span className="rewards-ready">
            <Gift aria-hidden="true" />
            {readyCount > 0 ? `${readyCount} hadiah menunggu` : "Belum ada hadiah menunggu"}
          </span>
          <InfoHint title="Tentang hadiah">
            Semua hadiah berupa koin Racely. Pakai buat upgrade mesin atau
            kosmetik mobil di garasi.
          </InfoHint>
        </div>
      </section>

      <ReferralCard
        referral={game.referral}
        economy={game.economy}
        onInvite={onInvite}
        disabled={disabled}
      />

      <section className="panel rewards-list-panel" aria-label="Rincian hadiah">
        <SectionCardHeading
          icon={Gift}
          title="Rincian hadiah"
          aside={
            <Badge variant="secondary">{game.missionsClaimed.length}/{missions(game.economy).length} misi diklaim</Badge>
          }
        />
        <ul className="reward-list">
          {rows.map((row) => (
            <li
              key={row.id}
              id={row.id === "gift" ? "starter-gift" : `reward-${row.id}`}
              tabIndex={-1}
              className={cn(
                "reward-row",
                row.state === "ready" && "is-ready",
                row.state === "claimed" && "is-claimed",
              )}
            >
              <span className="reward-row-icon" aria-hidden="true">
                <row.icon />
              </span>
              <div className="reward-row-copy">
                <h3>{row.label}</h3>
                <p>{row.note}</p>
                {row.progress && (
                  <div className="mission-progress">
                    <Progress
                      value={(row.progress.value / row.progress.target) * 100}
                      aria-label={row.note}
                      className="flex-1"
                    />
                    <span>
                      {row.progress.value.toLocaleString("id-ID")}/
                      {row.progress.target.toLocaleString("id-ID")}
                    </span>
                  </div>
                )}
              </div>
              <div className="reward-row-action">
                <strong>{formatCoins(row.amount)} <span>koin</span></strong>
                {row.state === "claimed" ? (
                  <span className="mission-status">
                    <Check size={14} aria-hidden="true" />
                    Diklaim
                  </span>
                ) : row.state === "ready" ? (
                  <Button
                    variant="gold"
                    disabled={disabled}
                    onClick={row.onClaim}
                    aria-label={`Klaim ${row.label}`}
                  >
                    Klaim
                  </Button>
                ) : (
                  <span className="mission-status">
                    <LockKeyhole size={14} aria-hidden="true" />
                    Belum siap
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
