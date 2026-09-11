"use client";

import { Check, Coins, Flag, Gift, LockKeyhole, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { InfoHint } from "./info-hint";
import { cn } from "@/lib/utils";
import {
  coins,
  formatCoins,
  idr,
  MISSIONS,
  missionValue,
  STARTER_GIFT,
  type GameState,
} from "@/lib/game";

export const GIFT_AMOUNT = STARTER_GIFT;

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
  const missions = MISSIONS.filter(
    (m) => !game.missionsClaimed.includes(m.id) && missionValue(game, m.id) >= m.target,
  ).reduce((sum, m) => sum + m.reward, 0);
  // Only whole coins can move from pending into the balance.
  return (
    Math.floor(game.pending) + (game.rewardClaimed ? 0 : GIFT_AMOUNT) + missions
  );
}

export function RewardsPanel({
  game,
  onClaimRace,
  onClaimGift,
  onClaimMission,
  onClaimAll,
  disabled = false,
}: {
  game: GameState;
  onClaimRace: () => void;
  onClaimGift: () => void;
  onClaimMission: (id: string) => void;
  onClaimAll: () => void;
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
      id: "gift",
      icon: Gift,
      label: "Bonus starter",
      note: game.rewardClaimed ? "Bonus sudah masuk ke saldo kamu." : "Hadiah pertamamu. Sekali klaim, langsung masuk saldo.",
      amount: GIFT_AMOUNT,
      state: game.rewardClaimed ? "claimed" : "ready",
      onClaim: onClaimGift,
    },
    ...MISSIONS.map((mission) => {
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
    <div className="rewards-layout section-enter flex flex-col gap-4">
      <section className="rewards-hero" aria-label="Total hadiah siap diklaim">
        <div className="rewards-hero-copy">
          <span className="eyebrow">Siap diklaim</span>
          <strong>{coins(total)}</strong>
          <p>
            {readyCount > 0
              ? `${readyCount} hadiah menunggu, setara ${idr(total)}.`
              : "Belum ada yang bisa diklaim. Gas lagi di lintasan."}
          </p>
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
      </section>

      <section className="panel rewards-list-panel" aria-label="Rincian hadiah">
        <div className="section-card-heading">
          <h2>
            <Gift aria-hidden="true" />
            Rincian hadiah
          </h2>
          <div className="heading-aside">
            <span>{game.missionsClaimed.length}/{MISSIONS.length} misi diklaim</span>
            <InfoHint title="Tentang hadiah">
              Semua hadiah berupa koin Racely. 1 koin setara {idr(1)} dan bisa
              ditarik lewat tab Dompet setelah saldo cukup.
            </InfoHint>
          </div>
        </div>
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
