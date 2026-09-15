"use client";

import { Check, LoaderCircle, LockKeyhole, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatCoins } from "@/lib/game";
import { cn } from "@/lib/utils";

export type RewardRowState = "ready" | "waiting" | "claimed";

/**
 * Baris hadiah dan misi memakai anatomi `.upgrade-row` yang sama dengan box
 * garasi: tile ikon + judul + satu baris metrik (nominal) dan tombol kecil di
 * kanan. Misi menumpuk bar progres di bawah kepala baris.
 */
export function RewardRow({
  id,
  icon: Icon,
  label,
  amount,
  state,
  progress,
  disabled,
  busy = false,
  actionLabel = "Klaim",
  doneLabel = "Diklaim",
  onClaim,
}: {
  id?: string;
  icon: LucideIcon;
  label: string;
  amount: number;
  state: RewardRowState;
  progress?: { value: number; target: number };
  disabled: boolean;
  /** Tombolnya sedang menunggu (mis. iklan diputar); ikon berganti spinner. */
  busy?: boolean;
  /** Teks tombol saat `ready`; bonus iklan memakai "Tonton", bukan "Klaim". */
  actionLabel?: string;
  /** Teks badge saat `claimed`; jatah harian yang habis memakai "Habis". */
  doneLabel?: string;
  onClaim: () => void;
}) {
  return (
    <li
      id={id}
      tabIndex={id ? -1 : undefined}
      className={cn("upgrade-row reward-row", progress && "has-progress", state === "ready" && "is-ready", state === "claimed" && "is-claimed")}
    >
      <div className="upgrade-head">
        <span className="upgrade-icon" aria-hidden="true"><Icon /></span>
        <div className="upgrade-name">
          <h3>{label}</h3>
          <p className="setup-metric">
            <b>{formatCoins(amount)} koin</b>
          </p>
        </div>
        {state === "claimed" ? (
          <Badge variant="secondary" className="upgrade-buy reward-badge"><Check data-icon="inline-start" aria-hidden="true" />{doneLabel}</Badge>
        ) : state === "ready" ? (
          <Button variant="goldSoft" size="sm" className="upgrade-buy" disabled={disabled} onClick={onClaim} aria-busy={busy} aria-label={`${actionLabel} ${label}`}>
            {busy && <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />}
            {actionLabel}
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
