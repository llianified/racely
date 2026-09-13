"use client";

import { Check, Trophy, LockKeyhole, ArrowRight } from "lucide-react";
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
  const lapsDone = Math.min(game.laps, unlockLaps);
  return (
    <section className="panel stat-card circuit-panel">
      <SectionCardHeading
        icon={Trophy}
        title={active ? "Trek aktif" : "Trek berikutnya"}
        aside={
          unlocked && !active
            ? <Button size="sm" variant="gold" disabled={disabled} onClick={() => onChoose(1)}>Gas ke Midnight<ArrowRight data-icon="inline-end" /></Button>
            : <Badge variant="secondary">{active ? <Check data-icon="inline-start" /> : <LockKeyhole data-icon="inline-start" />}{active ? "Aktif" : "Terkunci"}</Badge>
        }
      />
      <h3 className="stat-card-value">Midnight Speedway</h3>
      <p className="stat-card-meta"><span className="circuit-ticket-label">Trek 2</span>Bonus permanen <b>+{formatCoins(game.economy.lapRewardPerCircuit)} koin/lap</b></p>
      {!unlocked && (
        <div className="circuit-unlock">
          <div className="circuit-unlock-row"><span>{unlockLaps - lapsDone} putaran lagi</span><span>{lapsDone}/{unlockLaps} lap</span></div>
          <Progress value={(lapsDone / unlockLaps) * 100} aria-label="Buka Midnight Speedway" />
        </div>
      )}
    </section>
  );
}
