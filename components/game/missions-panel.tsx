"use client";

import { Check, Flag, Gift, Trophy, LockKeyhole, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { InfoHint } from "./info-hint";
import { cn } from "@/lib/utils";
import { MISSIONS, missionValue, rupiah, type GameState } from "@/lib/game";

export function MissionsPanel({ game, onClaim, disabled = false }: { game: GameState; onClaim: (id: string) => void; disabled?: boolean }) {
  return (
    <section className="panel mission-panel">
      <div className="section-card-heading"><h2><Flag aria-hidden="true" />Misi sesi ini</h2><span className="text-sm text-muted-foreground">{game.missionsClaimed.length}/{MISSIONS.length} diklaim</span></div>
      <div className="mission-list">
        {MISSIONS.map((m) => {
          const value = Math.min(m.target, missionValue(game, m.id));
          const claimed = game.missionsClaimed.includes(m.id);
          const complete = value >= m.target;
          return (
            <div key={m.id} className={cn("mission-card", complete && !claimed && "is-ready", claimed && "is-claimed")}>
              <div className="mission-top">
                <h3>{m.title}</h3>
                <span className="mission-reward">
                  {claimed ? <><Check aria-hidden="true" />Diklaim</> : `+${rupiah(m.reward)}`}
                </span>
                <InfoHint title={m.title}>{m.description}</InfoHint>
              </div>
              <div className="mission-progress">
                <Progress value={(value / m.target) * 100} aria-label={m.description} className="flex-1" />
                <span>{value.toLocaleString("id-ID")}/{m.target.toLocaleString("id-ID")}</span>
                {complete && !claimed && (
                  <Button variant="gold" size="sm" className="mission-claim" disabled={disabled} onClick={() => onClaim(m.id)} aria-label={`Klaim hadiah ${m.title}`}>Klaim</Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function StarterGift({ claimed, onClaim, disabled = false }: { claimed: boolean; onClaim: () => void; disabled?: boolean }) {
  return (
    <section id="starter-gift" tabIndex={-1} className="reward-ticket" aria-label="Bonus starter">
      <div className="section-card-heading"><h2><Gift aria-hidden="true" />Bonus starter</h2><InfoHint title="Bonus starter">Bonus satu kali per akun, hanya untuk koin virtual Racely. Gunakan untuk upgrade mobil; tidak bisa ditukar uang.</InfoHint></div>
      <div className="gift-bottom">
        <strong>Rp5.000</strong>
        {claimed ? <span className="mission-status"><Check size={16} aria-hidden="true" />Diklaim</span> : <Button variant="gold" onClick={onClaim} disabled={disabled} aria-label="Klaim bonus starter">Klaim bonus</Button>}
      </div>
    </section>
  );
}

export function CircuitPanel({ game, onChoose, disabled = false }: { game: GameState; onChoose: (circuit: number) => void; disabled?: boolean }) {
  const unlocked = game.laps >= 25;
  const active = game.circuit === 1;
  return (
    <section className="panel circuit-panel">
      <div className="section-card-heading">
        <h2><Trophy aria-hidden="true" />{active ? "Sirkuit aktif" : "Sirkuit berikutnya"}</h2>
        <Badge variant="secondary">{!unlocked ? <LockKeyhole data-icon="inline-start" /> : active ? <Check data-icon="inline-start" /> : <Flag data-icon="inline-start" />}{!unlocked ? "Terkunci" : active ? "Aktif" : "Terbuka"}</Badge>
      </div>
      <div className="circuit-preview"><h3>Midnight Speedway</h3><p>Bonus +Rp150/lap</p></div>
      {!unlocked && <>
        <p className="circuit-description">Buka dengan 25 putaran.</p>
        <div className="mission-progress circuit-progress"><Progress value={Math.min((game.laps / 25) * 100, 100)} aria-label="Buka Midnight Speedway" className="flex-1" /><span>{Math.min(game.laps, 25)}/25</span></div>
      </>}
      {unlocked && <Button className="mt-3 w-full" disabled={disabled} onClick={() => onChoose(active ? 0 : 1)}>{active ? "Kembali ke Jakarta" : "Gas ke Midnight"}<ArrowRight data-icon="inline-end" /></Button>}
    </section>
  );
}
