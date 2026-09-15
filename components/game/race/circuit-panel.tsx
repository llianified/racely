"use client";

import { Check, Flag, Trophy, LockKeyhole, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatCoins, type GameState } from "@/lib/game";
import { circuitUnlockLaps } from "@/lib/economy-config";
import { LAST_CIRCUIT, circuitName } from "@/lib/track-layout";
import { SectionCardHeading } from "../shell/section-card-heading";

export function CircuitPanel({ game, onChoose, disabled = false }: { game: GameState; onChoose: (circuit: number) => void; disabled?: boolean }) {
  // Sirkuitnya dibaca dari `TRACK_LAYOUTS`, bukan ditulis satu per satu: panel
  // yang hanya tahu Midnight membuat trek ketiga tak pernah bisa dipilih
  // walaupun server dan arena 3D sudah mendukungnya.
  const active = game.circuit >= LAST_CIRCUIT;
  const target = active ? LAST_CIRCUIT : game.circuit + 1;
  // Ambang dan bonusnya datang dari config, bukan literal: server menegakkan
  // `economy.circuitUnlockLaps`, jadi angka yang ditulis lepas di sini membuat
  // panel menawarkan unlock yang ditolak server -- atau menyembunyikan unlock
  // yang sebenarnya sudah terbuka.
  const unlockLaps = circuitUnlockLaps(game.economy, target);
  const unlocked = target <= game.circuit || game.laps >= unlockLaps;
  const name = circuitName(target);
  const shortName = name.split(" ")[0];
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
        <span className="circuit-ticket-label">Trek {target + 1}</span>
        <div><h3>{name}</h3><p>Bonus permanen +{formatCoins(game.economy.lapRewardPerCircuit)} koin/lap</p></div>
        <Flag className="circuit-ticket-flag" aria-hidden="true" />
      </div>
      {!unlocked && <>
        <p className="circuit-description">{unlockLaps - game.laps} putaran lagi menuju {shortName}.</p>
        <div className="mission-progress circuit-progress"><Progress value={Math.min((game.laps / unlockLaps) * 100, 100)} aria-label={`Buka ${name}`} className="flex-1" /><span>{Math.min(game.laps, unlockLaps)}/{unlockLaps}</span></div>
      </>}
      {active && <p className="circuit-description">Reward tertinggi tetap aktif.</p>}
      {unlocked && !active && <Button variant="gold" className="mt-md w-full" disabled={disabled} onClick={() => onChoose(target)}>Gas ke {shortName}<ArrowRight data-icon="inline-end" /></Button>}
    </section>
  );
}
