"use client";

import { Check, Flag, Trophy, LockKeyhole, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatCoins, type GameState } from "@/lib/game";
import { SectionCardHeading } from "../shell/section-card-heading";

export function CircuitPanel({ game, onChoose, disabled = false }: { game: GameState; onChoose: (circuit: 1) => void; disabled?: boolean }) {
  // Ambang dan bonusnya datang dari config, bukan literal: server menegakkan
  // `economy.circuitUnlockLaps`, jadi angka yang ditulis lepas di sini membuat
  // panel menawarkan unlock yang ditolak server -- atau menyembunyikan unlock
  // yang sebenarnya sudah terbuka.
  const unlockLaps = game.economy.circuitUnlockLaps;
  const unlocked = game.laps >= unlockLaps;
  const active = game.circuit === 1;
  return (
    <section className="panel circuit-panel">
      <SectionCardHeading
        icon={Trophy}
        title={active ? "Trek aktif" : "Trek berikutnya"}
        aside={
          <Badge variant="secondary">{!unlocked ? <LockKeyhole data-icon="inline-start" /> : active ? <Check data-icon="inline-start" /> : <Flag data-icon="inline-start" />}{!unlocked ? "Terkunci" : active ? "Aktif" : "Terbuka"}</Badge>
        }
      />
      <div className="circuit-preview">
        <span className="circuit-ticket-label">Trek 2</span>
        <div><h3>Midnight Speedway</h3><p>Bonus permanen +{formatCoins(game.economy.lapRewardPerCircuit)} koin/lap</p></div>
        <Flag className="circuit-ticket-flag" aria-hidden="true" />
      </div>
      {!unlocked && <>
        <p className="circuit-description">{unlockLaps - game.laps} putaran lagi menuju Midnight.</p>
        <div className="mission-progress circuit-progress"><Progress value={Math.min((game.laps / unlockLaps) * 100, 100)} aria-label="Buka Midnight Speedway" className="flex-1" /><span>{Math.min(game.laps, unlockLaps)}/{unlockLaps}</span></div>
      </>}
      {active && <p className="circuit-description">Reward tertinggi tetap aktif.</p>}
      {unlocked && !active && <Button variant="gold" className="mt-md w-full" disabled={disabled} onClick={() => onChoose(1)}>Gas ke Midnight<ArrowRight data-icon="inline-end" /></Button>}
    </section>
  );
}
