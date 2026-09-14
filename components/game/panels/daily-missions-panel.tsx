"use client";

import { CalendarCheck, Check, Flag, LockKeyhole } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DAILY_MISSION_COPY, type DailyMissionKind, type DailyMissions } from "@/lib/daily-missions";
import { formatCoins } from "@/lib/game";
import { cn } from "@/lib/utils";
import { SectionCardHeading } from "../shell/section-card-heading";

export function DailyMissionsPanel({ daily, disabled, onClaim }: {
  daily?: DailyMissions;
  disabled: boolean;
  onClaim: (day: string, kind: DailyMissionKind) => void;
}) {
  if (!daily) return null;
  const done = daily.items.filter(item => item.claimed).length;
  return <section className="panel rewards-list-panel" aria-label="Misi harian">
    <SectionCardHeading
      icon={CalendarCheck}
      title="Misi harian"
      aside={<Badge variant="secondary">{done}/3 selesai</Badge>}
    />
    <ul className="reward-list">
      {daily.items.map(item => {
        const copy = DAILY_MISSION_COPY[item.kind];
        const value = Math.min(item.target, daily.values[item.kind]);
        const ready = !item.claimed && value >= item.target;
        return <li key={item.kind} className={cn("reward-row", ready && "is-ready", item.claimed && "is-claimed")}>
          <span className="reward-row-icon" aria-hidden="true"><Flag /></span>
          <div className="reward-row-copy">
            <h3>{copy.title}</h3>
            <p>Selesaikan {formatCoins(item.target)} {copy.unit} hari ini.</p>
            <div className="mission-progress">
              <Progress className="flex-1" value={value / item.target * 100} aria-label={`${copy.title}: ${formatCoins(value)} dari ${formatCoins(item.target)}`} />
              <span>{formatCoins(value)}/{formatCoins(item.target)}</span>
            </div>
          </div>
          <div className="reward-row-action">
            <strong>{formatCoins(item.reward)} <span>koin</span></strong>
            {item.claimed ? <span className="mission-status"><Check aria-hidden="true" />Diklaim</span> : <Button variant={ready ? "goldSoft" : "secondary"} disabled={disabled || !ready} onClick={() => onClaim(daily.day, item.kind)} aria-label={`Klaim ${copy.title}`}>{ready ? "Klaim" : <><LockKeyhole data-icon="inline-start" />Belum siap</>}</Button>}
          </div>
        </li>;
      })}
    </ul>
  </section>;
}
