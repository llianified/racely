"use client";

import {
  Check,
  ChevronRight,
  Flag,
  Gift,
  Trophy,
  LockKeyhole,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { MISSIONS, missionValue, rupiah, type GameState } from "@/lib/game";

export function MissionsPanel({
  game,
  onClaim,
  compact = false,
  onOpen,
  disabled = false,
}: {
  game: GameState;
  onClaim: (id: string) => void;
  compact?: boolean;
  onOpen?: () => void;
  disabled?: boolean;
}) {
  return (
    <section className="panel p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold">
          <Flag className="size-4 text-primary" />
          Misi sesi ini
        </h2>
        {compact && (
          <button onClick={onOpen} aria-label="Lihat semua misi">
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
        )}
      </div>
      <div className="flex flex-col divide-y divide-border">
        {(compact ? MISSIONS.slice(0, 1) : MISSIONS).map((m) => {
          const value = Math.min(m.target, missionValue(game, m.id));
          const claimed = game.missionsClaimed.includes(m.id);
          return (
            <div key={m.id} className="py-4 last:pb-0">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{m.title}</h3>
                <span className="text-sm font-medium text-accent">
                  +{rupiah(m.reward)}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {m.description}
              </p>
              <div className="flex items-center gap-4 pt-4">
                <Progress
                  value={(value / m.target) * 100}
                  aria-label={m.description}
                  className="flex-1"
                />
                <span className="font-mono text-sm text-muted-foreground">
                  {value.toLocaleString("id-ID")}/
                  {m.target.toLocaleString("id-ID")}
                </span>
              </div>
              {(value >= m.target || !compact) && (
                <div className="pt-4">
                  <Button
                    className="w-full"
                    variant={claimed ? "secondary" : "default"}
                    disabled={disabled || claimed || value < m.target}
                    onClick={() => onClaim(m.id)}
                  >
                    {claimed ? (
                      <>
                        <Check data-icon="inline-start" />
                        Sudah diklaim
                      </>
                    ) : (
                      "Klaim hadiah"
                    )}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function StarterGift({
  claimed,
  onClaim,
  disabled = false,
}: {
  claimed: boolean;
  onClaim: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="reward-ticket">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Gift className="size-5" />
        </div>
        <div>
          <h3 className="font-semibold">Modal gas pertama</h3>
          <p className="text-sm text-muted-foreground">
            Bonus starter <span className="text-accent">Rp5.000 virtual</span>
          </p>
        </div>
      </div>
      <button
        onClick={onClaim}
        disabled={disabled || claimed}
        className="rounded-lg border border-accent/25 px-3 py-2 text-sm font-semibold text-accent disabled:opacity-50"
      >
        {claimed ? (
          <Check className="size-4" aria-label="Sudah diklaim" />
        ) : (
          "Klaim"
        )}
      </button>
    </div>
  );
}

export function CircuitPanel({
  game,
  onChoose,
  compact = false,
  disabled = false,
}: {
  game: GameState;
  onChoose: (circuit: number) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  const unlocked = game.laps >= 25;
  return (
    <section className="panel p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold">
          <Trophy className="size-4 text-accent" />
          Tantangan berikutnya
        </h2>
        {!unlocked && <LockKeyhole className="size-4 text-muted-foreground" />}
      </div>
      <div className="pt-4">
        <h3 className="font-semibold">Midnight Speedway</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          25 putaran untuk membuka sirkuit baru.
        </p>
        <div className="flex items-center gap-4 pt-4">
          <Progress
            value={Math.min((game.laps / 25) * 100, 100)}
            aria-label="Buka Midnight Speedway"
            className="flex-1"
          />
          <span className="font-mono text-sm text-muted-foreground">
            {Math.min(game.laps, 25)}/25
          </span>
        </div>
        {unlocked ? (
          <div className="pt-4">
            <Button
              className="w-full"
              disabled={disabled}
              onClick={() => onChoose(game.circuit === 1 ? 0 : 1)}
            >
              {game.circuit === 1 ? "Kembali ke Jakarta" : "Gas ke Midnight"}
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        ) : (
          !compact && (
            <p className="mt-4 text-sm text-accent">
              Bonus +Rp150 virtual setiap putaran di sirkuit ini.
            </p>
          )
        )}
      </div>
    </section>
  );
}
