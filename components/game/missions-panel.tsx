"use client";

import { Check, ChevronRight, Flag, Gift, Trophy, LockKeyhole, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { MISSIONS, missionValue, rupiah, type GameState } from "@/lib/game";

export function MissionsPanel({
  game, onClaim, compact = false, onOpen, disabled = false,
}: {
  game: GameState;
  onClaim: (id: string) => void;
  compact?: boolean;
  onOpen?: () => void;
  disabled?: boolean;
}) {
  return (
    <section className="panel mission-panel">
      <div className="section-card-heading">
        <h2><Flag aria-hidden="true" />Misi sesi ini</h2>
        {compact && onOpen && (
          <button onClick={onOpen} aria-label="Lihat semua misi">
            Semua<ChevronRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="mission-list">
        {(compact ? MISSIONS.slice(0, 1) : MISSIONS).map((m) => {
          const value = Math.min(m.target, missionValue(game, m.id));
          const claimed = game.missionsClaimed.includes(m.id);
          const complete = value >= m.target;
          return (
            <div key={m.id} className="mission-card">
              <div className="mission-title">
                <h3>{m.title}</h3>
                <span>+{rupiah(m.reward)}</span>
              </div>
              <p>{m.description}</p>
              <div className="mission-progress">
                <Progress value={(value / m.target) * 100} aria-label={m.description} className="flex-1" />
                <span>{value.toLocaleString("id-ID")}/{m.target.toLocaleString("id-ID")}</span>
              </div>
              {(complete || !compact) && (
                <Button
                  className="mt-4 w-full"
                  variant={complete && !claimed ? "gold" : "secondary"}
                  disabled={disabled || claimed || !complete}
                  onClick={() => onClaim(m.id)}
                >
                  {claimed ? <><Check data-icon="inline-start" />Sudah diklaim</> : complete ? "Klaim hadiah" : "Selesaikan misi"}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function StarterGift({ claimed, onClaim, disabled = false }: {
  claimed: boolean;
  onClaim: () => void;
  disabled?: boolean;
}) {
  return (
    <section id="starter-gift" tabIndex={-1} className="reward-ticket" aria-label="Bonus starter">
      <div className="gift-copy">
        <div className="gift-icon"><Gift aria-hidden="true" /></div>
        <div>
          <span className="eyebrow">RACER STARTER PACK</span>
          <h3>Modal gas pertama.</h3>
          <p>Racikan pertama, dari kami.<strong>Rp5.000 virtual</strong></p>
        </div>
      </div>
      <Button variant={claimed ? "secondary" : "gold"} onClick={onClaim} disabled={disabled || claimed}>
        {claimed ? <><Check data-icon="inline-start" />Sudah diklaim</> : <><Gift data-icon="inline-start" />Klaim bonus starter</>}
      </Button>
      <small>Bonus satu kali. Khusus koin virtual Racely.</small>
    </section>
  );
}

export function CircuitPanel({ game, onChoose, compact = false, disabled = false }: {
  game: GameState;
  onChoose: (circuit: number) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  const unlocked = game.laps >= 25;
  const active = game.circuit === 1;
  return (
    <section className="panel circuit-panel">
      <div className="section-card-heading">
        <h2><Trophy aria-hidden="true" />{active ? "Sirkuit aktif" : "Sirkuit berikutnya"}</h2>
      </div>
      <div className="circuit-preview">
        <Badge variant="secondary">
          {!unlocked ? <LockKeyhole data-icon="inline-start" /> : active ? <Check data-icon="inline-start" /> : <Flag data-icon="inline-start" />}
          {!unlocked ? "TERKUNCI" : active ? "AKTIF" : "TERBUKA"}
        </Badge>
        <Flag aria-hidden="true" />
        <h3>Midnight<br />Speedway</h3>
        <p>CIRCUIT 02 / NIGHT SERIES</p>
      </div>
      <p className="circuit-description">
        {unlocked ? "Lintasan baru. Ambisi lebih besar." : "Selesaikan 25 putaran untuk membuka sirkuit ini."}
      </p>
      <div className="mission-progress">
        <Progress value={Math.min((game.laps / 25) * 100, 100)} aria-label="Buka Midnight Speedway" className="flex-1" />
        <span>{Math.min(game.laps, 25)}/25</span>
      </div>
      {unlocked ? (
        <Button className="mt-5 w-full" disabled={disabled} onClick={() => onChoose(active ? 0 : 1)}>
          {active ? "Kembali ke Jakarta" : "Gas ke Midnight"}<ArrowRight data-icon="inline-end" />
        </Button>
      ) : !compact && (
        <p className="mt-4 text-sm text-accent">Bonus +Rp150 virtual setiap putaran di sirkuit ini.</p>
      )}
    </section>
  );
}
