"use client";

import { Check, LockKeyhole, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatCoins } from "@/lib/game";
import { cn } from "@/lib/utils";

export type RewardRowState = "ready" | "waiting" | "claimed";

/**
 * Baris hadiah dan misi memakai anatomi `.upgrade-row` yang sama dengan box
 * garasi: tile ikon + judul + satu baris metrik (nominal · keterangan) dan
 * tombol kecil di kanan. Misi menumpuk bar progres di bawah kepala baris.
 */
export function RewardRow({
  id,
  icon: Icon,
  label,
  note,
  amount,
  state,
  progress,
  disabled,
  onClaim,
}: {
  id?: string;
  icon: LucideIcon;
  label: string;
  note: string;
  amount: number;
  state: RewardRowState;
  progress?: { value: number; target: number };
  disabled: boolean;
  onClaim: () => void;
}) {
  return (
    <li
      id={id}
      tabIndex={id ? -1 : undefined}
      className={cn("upgrade-row reward-row", state === "ready" && "is-ready", state === "claimed" && "is-claimed")}
    >
      <div className="upgrade-head">
        <span className="upgrade-icon" aria-hidden="true"><Icon /></span>
        <div className="upgrade-name">
          <h3>{label}</h3>
          <p className="setup-metric">
            <b>{formatCoins(amount)} koin</b>
          </p>
          <p className="reward-note">{note}</p>
        </div>
        {state === "claimed" ? (
          <Badge variant="secondary" className="upgrade-buy"><Check data-icon="inline-start" aria-hidden="true" />Diklaim</Badge>
        ) : state === "ready" ? (
          <Button variant="goldSoft" size="sm" className="upgrade-buy" disabled={disabled} onClick={onClaim} aria-label={`Klaim ${label}`}>
            Klaim
          </Button>
        ) : (
          <Button variant="secondary" size="sm" className="upgrade-buy" disabled>
            <LockKeyhole data-icon="inline-start" />Belum siap
          </Button>
        )}
      </div>
      {progress && (
        <div className="mission-progress">
          <Progress
            className="flex-1"
            value={(progress.value / progress.target) * 100}
            aria-label={`${label}: ${formatCoins(progress.value)} dari ${formatCoins(progress.target)}`}
          />
          <span>{formatCoins(progress.value)}/{formatCoins(progress.target)}</span>
        </div>
      )}
    </li>
  );
}
