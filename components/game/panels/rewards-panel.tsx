"use client";

import { CalendarCheck, Clapperboard, Coins, Flag, Gift, Trophy, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DailyMissionsPanel } from "./daily-missions-panel";
import { RewardRow, type RewardRowState } from "./reward-row";
import { dailyMissionClaimable, type DailyMissionKind } from "@/lib/daily-missions";
import { SectionCardHeading } from "../shell/section-card-heading";
import { StatHero } from "../shell/stat-hero";
import {
  missions,
  missionValue,
  type GameState,
  type MissionId,
} from "@/lib/game";

type RowState = RewardRowState;

type RewardItem = {
  id: string;
  icon: typeof Gift;
  label: string;
  amount: number;
  state: RowState;
  onClaim: () => void;
};

const MISSION_ICONS: Record<MissionId, typeof Gift> = {
  laps: Flag,
  upgrade: Wrench,
  earn: Coins,
};

type MissionRow = {
  id: MissionId;
  icon: typeof Gift;
  label: string;
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
    missionTotal +
    dailyMissionClaimable(game.dailyMissions)
  );
}

export function RewardsPanel({
  game,
  onClaimRace,
  onClaimDaily,
  onClaimGift,
  onClaimMission,
  onClaimDailyMission,
  onClaimAll,
  onWatchAd,
  adAvailable = false,
  adBusy = false,
  disabled = false,
}: {
  game: GameState;
  onClaimRace: () => void;
  onClaimDaily: () => void;
  onClaimGift: () => void;
  onClaimMission: (id: MissionId) => void;
  onClaimDailyMission: (day: string, kind: DailyMissionKind) => void;
  onClaimAll: () => void;
  onWatchAd: () => void;
  /** Block Adsgram terkonfigurasi di build ini; tanpa itu barisnya disembunyikan. */
  adAvailable?: boolean;
  /** Iklan sedang diputar; tombolnya menampilkan spinner. */
  adBusy?: boolean;
  disabled?: boolean;
}) {
  const total = claimableTotal(game);
  // Bonus iklan tidak masuk `claimableTotal`: koinnya baru ada setelah iklan
  // ditonton, jadi "Klaim semua" tidak boleh menjanjikannya.
  const ad = game.adReward;
  const showAdRow = adAvailable && ad.dailyCap > 0;
  const rewards: RewardItem[] = [
    {
      id: "race",
      icon: Flag,
      label: "Hasil balapan",
      amount: Math.floor(game.pending),
      state: game.pending >= 1 ? "ready" : "waiting",
      onClaim: onClaimRace,
    },
    {
      id: "daily",
      icon: CalendarCheck,
      label: "Check-in harian",
      amount: game.daily.claimedToday ? game.daily.nextReward : game.daily.reward,
      state: game.daily.claimedToday ? "claimed" : "ready",
      onClaim: onClaimDaily,
    },
    {
      id: "gift",
      icon: Gift,
      label: "Bonus starter",
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
      icon: MISSION_ICONS[mission.id],
      label: mission.title,
      amount: mission.reward,
      state: claimed ? "claimed" : value >= mission.target ? "ready" : "waiting",
      value: claimed ? mission.target : value,
      target: mission.target,
      onClaim: () => onClaimMission(mission.id),
    };
  });
  const readyCount =
    rewards.filter((row) => row.state === "ready").length +
    missionRows.filter((row) => row.state === "ready").length +
    (game.dailyMissions?.items.filter(item => !item.claimed && game.dailyMissions!.values[item.kind] >= item.target).length ?? 0);
  const missionsDone = missionRows.filter((row) => row.state === "claimed").length;

  return (
    <div className="rewards-layout section-enter flex flex-col gap-lg">
      <StatHero
        ariaLabel="Total hadiah siap diklaim"
        label="Siap diklaim"
        figure={total}
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

      <section className="panel upgrade-panel" aria-label="Hadiah">
        <SectionCardHeading
          icon={Gift}
          title="Hadiah"
          aside={
            <Badge variant="secondary">
              {rewards.filter((row) => row.state === "ready").length} siap
            </Badge>
          }
        />
        <ul className="upgrade-list">
          {rewards.map((row) => (
            <RewardRow
              key={row.id}
              id={row.id === "gift" ? "starter-gift" : `reward-${row.id}`}
              icon={row.icon}
              label={row.label}
              amount={row.amount}
              state={row.state}
              disabled={disabled}
              onClaim={row.onClaim}
            />
          ))}
          {showAdRow && (
            <RewardRow
              id="reward-ad"
              icon={Clapperboard}
              label="Bonus iklan"
              amount={ad.available ? ad.reward : game.economy.adRewardCoins}
              state={ad.available ? "ready" : "claimed"}
              progress={{ value: ad.watchedToday, target: ad.dailyCap }}
              disabled={disabled || adBusy}
              busy={adBusy}
              actionLabel={adBusy ? "Memutar…" : "Tonton"}
              doneLabel="Habis"
              onClaim={onWatchAd}
            />
          )}
        </ul>
      </section>

      <DailyMissionsPanel daily={game.dailyMissions} disabled={disabled} onClaim={onClaimDailyMission} />

      <section
        id="missions"
        tabIndex={-1}
        className="panel upgrade-panel"
        aria-label="Misi"
      >
        <SectionCardHeading
          icon={Trophy}
          title="Misi awal · sekali klaim"
          aside={
            <Badge variant="secondary">
              {missionsDone}/{missionRows.length} selesai
            </Badge>
          }
        />
        <ul className="upgrade-list">
          {missionRows.map((row) => (
            <RewardRow
              key={row.id}
              id={`reward-${row.id}`}
              icon={row.icon}
              label={row.label}
              amount={row.amount}
              state={row.state}
              progress={{ value: row.value, target: row.target }}
              disabled={disabled}
              onClaim={row.onClaim}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}
