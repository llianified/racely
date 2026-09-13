"use client";

import { CalendarCheck, Check, Coins, Flag, Gift, LockKeyhole, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { InfoHint } from "./info-hint";
import { SectionCardHeading } from "../shell/section-card-heading";
import { StatHero } from "../shell/stat-hero";
import { cn } from "@/lib/utils";
import {
  coins,
  formatCoins,
  missions,
  missionValue,
  type GameState,
  type MissionId,
} from "@/lib/game";

type RowState = "ready" | "waiting" | "claimed";

type RewardRow = {
  id: string;
  icon: typeof Gift;
  label: string;
  note: string;
  amount: number;
  state: RowState;
  onClaim: () => void;
};

type MissionRow = {
  id: MissionId;
  label: string;
  note: string;
  amount: number;
  state: RowState;
  value: number;
  target: number;
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

function RowStatus({ state }: { state: Exclude<RowState, "ready"> }) {
  return state === "claimed" ? (
    <span className="mission-status">
      <Check size={14} aria-hidden="true" />
      Diklaim
    </span>
  ) : (
    <span className="mission-status">
      <LockKeyhole size={14} aria-hidden="true" />
      Belum siap
    </span>
  );
}

export function RewardsPanel({
  game,
  onClaimRace,
  onClaimDaily,
  onClaimGift,
  onClaimMission,
  onClaimAll,
  disabled = false,
}: {
  game: GameState;
  onClaimRace: () => void;
  onClaimDaily: () => void;
  onClaimGift: () => void;
  onClaimMission: (id: MissionId) => void;
  onClaimAll: () => void;
  disabled?: boolean;
}) {
  const total = claimableTotal(game);
  const rewards: RewardRow[] = [
    {
      id: "race",
      icon: Flag,
      label: "Hasil balapan",
      note:
        game.pending >= 1
          ? "Koin dari putaran yang sudah selesai."
          : `Terkumpul ${coins(game.pending)} · butuh 1 koin penuh.`,
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
      note: game.rewardClaimed
        ? "Bonus sudah masuk ke saldo kamu."
        : "Hadiah pertamamu. Sekali klaim, langsung masuk saldo.",
      amount: game.economy.starterGift,
      state: game.rewardClaimed ? "claimed" : "ready",
      onClaim: onClaimGift,
    },
  ];
  const missionRows: MissionRow[] = missions(game.economy).map((mission) => {
    const value = Math.min(mission.target, missionValue(game, mission.id));
    const claimed = game.missionsClaimed.includes(mission.id);
    return {
      id: mission.id,
      label: mission.title,
      note: mission.description,
      amount: mission.reward,
      state: claimed ? "claimed" : value >= mission.target ? "ready" : "waiting",
      value: claimed ? mission.target : value,
      target: mission.target,
      onClaim: () => onClaimMission(mission.id),
    };
  });
  const readyCount =
    rewards.filter((row) => row.state === "ready").length +
    missionRows.filter((row) => row.state === "ready").length;
  const missionsDone = missionRows.filter((row) => row.state === "claimed").length;

  return (
    <div className="rewards-layout section-enter flex flex-col gap-lg">
      <StatHero
        ariaLabel="Total hadiah siap diklaim"
        label="Siap diklaim"
        figure={formatCoins(total)}
        info={
          <InfoHint title="Tentang hadiah">
            Semua hadiah berupa koin Racely. Pakai buat upgrade mesin atau
            kosmetik mobil di garasi.
          </InfoHint>
        }
        action={
          <Button
            variant="gold"
            disabled={disabled || total <= 0}
            onClick={onClaimAll}
          >
            <Coins data-icon="inline-start" />
            Klaim semua
          </Button>
        }
        stats={[
          { label: "Item siap", value: `${readyCount} item` },
          { label: "Streak harian", value: `${game.daily.streak} hari` },
        ]}
      />

      <section className="panel rewards-list-panel" aria-label="Hadiah">
        <SectionCardHeading
          icon={Gift}
          title="Hadiah"
          aside={
            <Badge variant="secondary">
              {rewards.filter((row) => row.state === "ready").length} siap
            </Badge>
          }
        />
        <ul className="reward-list">
          {rewards.map((row) => (
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
              </div>
              <div className="reward-row-action">
                <strong>{formatCoins(row.amount)} <span>koin</span></strong>
                {row.state === "ready" ? (
                  <Button
                    variant="gold"
                    disabled={disabled}
                    onClick={row.onClaim}
                    aria-label={`Klaim ${row.label}`}
                  >
                    Klaim
                  </Button>
                ) : (
                  <RowStatus state={row.state} />
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section
        id="missions"
        tabIndex={-1}
        className="panel rewards-list-panel"
        aria-label="Misi"
      >
        <SectionCardHeading
          icon={Trophy}
          title="Misi"
          aside={
            <Badge variant="secondary">
              {missionsDone}/{missionRows.length} selesai
            </Badge>
          }
        />
        <ul className="mission-list">
          {missionRows.map((row) => (
            <li
              key={row.id}
              id={`reward-${row.id}`}
              tabIndex={-1}
              className={cn(
                "mission-row",
                row.state === "ready" && "is-ready",
                row.state === "claimed" && "is-claimed",
              )}
            >
              <div className="mission-row-head">
                <h3>{row.label}</h3>
                <strong className="mission-row-reward">
                  +{formatCoins(row.amount)} <span>koin</span>
                </strong>
              </div>
              <p>{row.note}</p>
              <div className="mission-row-foot">
                <div className="mission-progress">
                  <Progress
                    value={(row.value / row.target) * 100}
                    aria-label={`${row.label}: ${row.value.toLocaleString("id-ID")} dari ${row.target.toLocaleString("id-ID")}`}
                    className="flex-1"
                  />
                  <span>
                    {row.value.toLocaleString("id-ID")}/{row.target.toLocaleString("id-ID")}
                  </span>
                </div>
                {row.state === "ready" ? (
                  <Button
                    variant="gold"
                    size="sm"
                    disabled={disabled}
                    onClick={row.onClaim}
                    aria-label={`Klaim ${row.label}`}
                  >
                    Klaim
                  </Button>
                ) : (
                  <RowStatus state={row.state} />
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
