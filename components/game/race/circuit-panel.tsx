"use client";

import { Check, Flag, Trophy, LockKeyhole, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { type GameState } from "@/lib/game";
import { SectionCardHeading } from "../shell/section-card-heading";

export function CircuitPanel({ game, onChoose, disabled = false }: { game: GameState; onChoose: (circuit: number) => void; disabled?: boolean }) {
  const unlocked = game.laps >= 25;
  const active = game.circuit === 1;
  return (
    <section className="panel circuit-panel">
      <SectionCardHeading
        icon={Trophy}
        title={active ? "Sirkuit aktif" : "Sirkuit berikutnya"}
        aside={
          <Badge variant="secondary">{!unlocked ? <LockKeyhole data-icon="inline-start" /> : active ? <Check data-icon="inline-start" /> : <Flag data-icon="inline-start" />}{!unlocked ? "Terkunci" : active ? "Aktif" : "Terbuka"}</Badge>
        }
      />
      <div className="circuit-preview">
        <span className="circuit-ticket-number" aria-hidden="true">02</span>
        <div><h3>Midnight Speedway</h3><p>Bonus +0,02 koin/lap</p></div>
        <Flag className="circuit-ticket-flag" aria-hidden="true" />
      </div>
      {!unlocked && <>
        <p className="circuit-description">{25 - game.laps} putaran lagi menuju Midnight.</p>
        <div className="mission-progress circuit-progress"><Progress value={Math.min((game.laps / 25) * 100, 100)} aria-label="Buka Midnight Speedway" className="flex-1" /><span>{Math.min(game.laps, 25)}/25</span></div>
      </>}
      {unlocked && <Button variant="gold" className="mt-md w-full" disabled={disabled} onClick={() => onChoose(active ? 0 : 1)}>{active ? "Kembali ke Jakarta" : "Gas ke Midnight"}<ArrowRight data-icon="inline-end" /></Button>}
    </section>
  );
}
