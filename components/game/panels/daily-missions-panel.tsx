"use client";

import { CalendarCheck, Flag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DAILY_MISSION_COPY, type DailyMissionKind, type DailyMissions } from "@/lib/daily-missions";
import { SectionCardHeading } from "../shell/section-card-heading";
import { RewardRow } from "./reward-row";

export function DailyMissionsPanel({ daily, disabled, onClaim }: {
  daily?: DailyMissions;
  disabled: boolean;
  onClaim: (day: string, kind: DailyMissionKind) => void;
}) {
  if (!daily) return null;
  const done = daily.items.filter(item => item.claimed).length;
  return <section className="panel upgrade-panel" aria-label="Misi harian">
    <SectionCardHeading
      icon={CalendarCheck}
      title="Misi harian"
      aside={<Badge variant="secondary">{done}/{daily.items.length} selesai</Badge>}
    />
    <ul className="upgrade-list">
      {daily.items.map(item => {
        const copy = DAILY_MISSION_COPY[item.kind];
        const value = Math.min(item.target, daily.values[item.kind]);
        return <RewardRow
          key={item.kind}
          icon={Flag}
          label={copy.title}
          amount={item.reward}
          state={item.claimed ? "claimed" : value >= item.target ? "ready" : "waiting"}
          progress={{ value, target: item.target }}
          disabled={disabled}
          onClaim={() => onClaim(daily.day, item.kind)}
        />;
      })}
    </ul>
  </section>;
}
