"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  CalendarDays,
  CalendarRange,
  Check,
  Clock3,
  Flag,
  Gift,
  LockKeyhole,
  Sparkles,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatCoins, type GameState } from "@/lib/game";
import {
  millisecondsUntilMissionReset,
  type ActiveMission,
  type MissionScope,
} from "@/lib/missions";
import { SectionCardHeading } from "../shell/section-card-heading";
import { StatHero } from "../shell/stat-hero";

export function claimableTotal(game: GameState) {
  return (
    Math.floor(game.pending) +
    (game.daily.claimedToday ? 0 : game.daily.reward) +
    (game.rewardClaimed ? 0 : game.economy.starterGift)
  );
}

type RewardRow = {
  id: string;
  icon: LucideIcon;
  title: string;
  note: string;
  reward: number;
  claimed: boolean;
  ready: boolean;
  onClaim: () => void;
};

function RewardItem({ row, disabled }: { row: RewardRow; disabled: boolean }) {
  const Icon = row.icon;
  return (
    <article
      className={cn(
        "reward-row",
        row.ready && "is-ready",
        row.claimed && "is-claimed",
      )}
    >
      <span className="reward-row-icon" aria-hidden="true">
        <Icon />
      </span>
      <div className="reward-row-copy">
        <h3>{row.title}</h3>
        <p>{row.note}</p>
      </div>
      <div className="reward-row-action">
        <strong>
          +{formatCoins(row.reward)} <span>koin</span>
        </strong>
        <Button
          type="button"
          size="sm"
          variant={row.ready ? "gold" : "secondary"}
          onClick={row.onClaim}
          disabled={disabled || !row.ready}
        >
          {row.claimed ? (
            <>
              <Check aria-hidden="true" /> Selesai
            </>
          ) : row.ready ? (
            "Klaim"
          ) : (
            <>
              <LockKeyhole aria-hidden="true" /> Belum
            </>
          )}
        </Button>
      </div>
    </article>
  );
}

function formatCountdown(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60_000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days} hari ${hours} jam`;
  if (hours > 0) return `${hours} jam ${minutes} menit`;
  return `${minutes} menit`;
}

function MissionItem({
  mission,
  disabled,
  onClaim,
}: {
  mission: ActiveMission;
  disabled: boolean;
  onClaim: () => void;
}) {
  const complete = mission.progress >= mission.target;
  const shownProgress = Math.min(mission.progress, mission.target);
  const Icon = mission.kind === "laps" ? Flag : Zap;

  return (
    <article
      className={cn(
        "reward-row",
        complete && !mission.claimed && "is-ready",
        mission.claimed && "is-claimed",
      )}
    >
      <span className="reward-row-icon" aria-hidden="true">
        <Icon />
      </span>
      <div className="reward-row-copy">
        <h3>{mission.title}</h3>
        <p>{mission.description}</p>
        <div className="mission-progress">
          <Progress
            value={(shownProgress / mission.target) * 100}
            aria-label={`Progres ${mission.title}`}
          />
          <span>
            {shownProgress.toLocaleString("id-ID")}/
            {mission.target.toLocaleString("id-ID")}
          </span>
        </div>
      </div>
      <div className="reward-row-action">
        <strong>
          +{mission.reward.toLocaleString("id-ID")} <span>Sparepart</span>
        </strong>
        {mission.claimed ? (
          <span className="mission-status">
            <Check aria-hidden="true" /> Diklaim
          </span>
        ) : complete ? (
          <Button
            type="button"
            size="sm"
            variant="gold"
            onClick={onClaim}
            disabled={disabled}
          >
            <Wrench aria-hidden="true" /> Klaim
          </Button>
        ) : (
          <span className="mission-status">
            <LockKeyhole aria-hidden="true" /> Belum selesai
          </span>
        )}
      </div>
    </article>
  );
}

function MissionSection({
  title,
  scope,
  icon,
  missions,
  now,
  disabled,
  onMission,
}: {
  title: string;
  scope: MissionScope;
  icon: LucideIcon;
  missions: ActiveMission[];
  now: number | null;
  disabled: boolean;
  onMission: (scope: MissionScope, id: string) => void;
}) {
  const countdown =
    now === null
      ? "Menyiapkan reset"
      : `Reset ${formatCountdown(millisecondsUntilMissionReset(scope, new Date(now)))}`;

  return (
    <section className="panel rewards-list-panel" aria-label={title}>
      <SectionCardHeading
        icon={icon}
        title={title}
        aside={
          <span className="mission-reset">
            <Clock3 aria-hidden="true" /> {countdown}
          </span>
        }
      />
      <div className="reward-list">
        {missions.map((mission) => (
          <MissionItem
            key={`${scope}:${mission.id}`}
            mission={mission}
            disabled={disabled}
            onClaim={() => onMission(scope, mission.id)}
          />
        ))}
      </div>
    </section>
  );
}

export function RewardsPanel({
  game,
  onClaimAll,
  onClaimRace,
  onClaimGift,
  onClaimDaily,
  onClaimMission,
  disabled = false,
}: {
  game: GameState;
  onClaimAll: () => void;
  onClaimRace: () => void;
  onClaimGift: () => void;
  onClaimDaily: () => void;
  onClaimMission: (scope: MissionScope, id: string) => void;
  disabled?: boolean;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const total = claimableTotal(game);
  const dailyMissionClaims = game.missions.daily.filter(
    (mission) => mission.claimed,
  ).length;
  const weeklyMissionClaims = game.missions.weekly.filter(
    (mission) => mission.claimed,
  ).length;
  const rows: RewardRow[] = [
    {
      id: "race",
      icon: Flag,
      title: "Hasil balapan",
      note: "Pindahkan koin bulat hasil putaran ke saldo.",
      reward: Math.floor(game.pending),
      claimed: game.pending < 1,
      ready: game.pending >= 1,
      onClaim: onClaimRace,
    },
    {
      id: "daily",
      icon: Sparkles,
      title: "Check-in harian",
      note: game.daily.claimedToday
        ? `Streak ${game.daily.streak} hari terjaga.`
        : `Hari ke-${game.daily.streak + 1} menunggumu.`,
      reward: game.daily.claimedToday ? 0 : game.daily.reward,
      claimed: game.daily.claimedToday,
      ready: !game.daily.claimedToday,
      onClaim: onClaimDaily,
    },
    {
      id: "gift",
      icon: Gift,
      title: "Hadiah selamat datang",
      note: "Bonus satu kali untuk mulai merakit mobilmu.",
      reward: game.economy.starterGift,
      claimed: game.rewardClaimed,
      ready: !game.rewardClaimed,
      onClaim: onClaimGift,
    },
  ];

  const claimButton: ReactNode = (
    <Button
      type="button"
      variant="gold"
      onClick={onClaimAll}
      disabled={disabled || total <= 0}
    >
      Klaim semua
    </Button>
  );

  return (
    <div className="section-enter flex flex-col gap-lg">
      <StatHero
        ariaLabel="Ringkasan hadiah koin"
        label="Siap diklaim"
        figure={formatCoins(total)}
        action={claimButton}
        stats={[
          { label: "Sparepart", value: game.scrap.toLocaleString("id-ID") },
          {
            label: "Misi selesai",
            value: `${dailyMissionClaims + weeklyMissionClaims}/${game.missions.daily.length + game.missions.weekly.length}`,
          },
        ]}
      />

      <section className="panel rewards-list-panel" aria-label="Hadiah koin">
        <SectionCardHeading icon={Gift} title="Hadiah koin" />
        <div className="reward-list">
          {rows.map((row) => (
            <RewardItem key={row.id} row={row} disabled={disabled} />
          ))}
        </div>
      </section>

      <MissionSection
        title="Misi harian"
        scope="daily"
        icon={CalendarDays}
        missions={game.missions.daily}
        now={now}
        disabled={disabled}
        onMission={onClaimMission}
      />
      <MissionSection
        title="Misi mingguan"
        scope="weekly"
        icon={CalendarRange}
        missions={game.missions.weekly}
        now={now}
        disabled={disabled}
        onMission={onClaimMission}
      />
    </div>
  );
}
