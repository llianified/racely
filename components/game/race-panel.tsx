"use client";

import dynamic from "next/dynamic";
import { useRef, useState, type CSSProperties } from "react";
import { Camera, ChevronDown, Coins, Flag, Gauge, Maximize, RotateCcw, Timer, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { lapReward, lapSeconds, rupiah, type GameState } from "@/lib/game";
import { cn } from "@/lib/utils";

const RaceScene = dynamic(() => import("./race-scene"), {
  ssr: false,
  loading: () => (
    <div className="scene-loading" role="status">
      <Flag aria-hidden="true" />
      <strong>Menyiapkan arena 3D…</strong>
    </div>
  ),
});

export function RacePanel({ game, onBoost, onCircuits, disabled = false }: {
  game: GameState;
  onBoost: () => void;
  onCircuits: () => void;
  disabled?: boolean;
}) {
  const [cameraMode, setCameraMode] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const panel = useRef<HTMLElement>(null);
  const seconds = lapSeconds(game);
  const boosted = game.boostLeft > 0;
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (panel.current?.requestFullscreen) await panel.current.requestFullscreen();
      else toast.info("Putar perangkat untuk arena yang lebih luas.");
    } catch {
      toast.info("Layar penuh tidak tersedia. Kamu tetap bisa memutar dan memperbesar lintasan.");
    }
  };
  const openCircuits = async () => {
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); }
      catch { toast.info("Keluar dari layar penuh untuk memilih sirkuit."); return; }
    }
    onCircuits();
  };
  return (
    <section className={cn("panel track-panel", boosted && "is-boosted")} ref={panel} aria-label="Balapan otomatis">
      <div className="track-top">
        <h2 className="track-title">
          <Button variant="ghost" className="circuit-trigger" onClick={openCircuits} aria-label="Pilih sirkuit" aria-haspopup="dialog">
            {game.circuit ? "Midnight Speedway" : "Jakarta Raceway"}
            <ChevronDown data-icon="inline-end" />
          </Button>
        </h2>
        <span className="live-tag">AUTO</span>
      </div>
      <div className="scene-wrap">
        <div className="scene-overlay lap-hud">
          <span>Lap <strong>{String(game.laps + 1).padStart(3, "0")}</strong></span>
        </div>
        <RaceScene progress={game.progress} seconds={seconds} color={game.color} boosted={boosted} cameraMode={cameraMode} resetKey={resetKey} circuit={game.circuit} />
        {boosted && <div className="scene-overlay boost-hud"><Zap size={16} aria-hidden="true" />2× AKTIF</div>}
        <div className="scene-controls">
          <Button variant="outline" size="icon" onClick={() => setCameraMode((v) => (v + 1) % 3)} aria-label="Ganti sudut kamera">
            <Camera aria-hidden="true" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => { setCameraMode(0); setResetKey((v) => v + 1); }} aria-label="Reset kamera">
            <RotateCcw aria-hidden="true" />
          </Button>
          <Button variant="outline" size="icon" onClick={fullscreen} aria-label="Layar penuh">
            <Maximize aria-hidden="true" />
          </Button>
        </div>
        <div key={game.laps} className="lap-pop" aria-hidden="true">
          {game.laps > 0 && <>+{rupiah(lapReward(game))}<span>PUTARAN SELESAI</span></>}
        </div>
      </div>
      <div className="lap-progress" role="progressbar" aria-label="Progres putaran saat ini" aria-valuenow={Math.round(game.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ transform: `scaleX(${game.progress})` }} />
      </div>
      <div className="track-stats">
        <div className="track-stat">
          <div className="track-stat-label"><Gauge aria-hidden="true" />Kecepatan</div>
          <div className="track-stat-value">{(192 / seconds).toFixed(1)} <small>km/j</small></div>
        </div>
        <div className="track-stat">
          <div className="track-stat-label"><Timer aria-hidden="true" />Waktu/lap</div>
          <div className="track-stat-value">{seconds.toFixed(2)} <small>d</small></div>
        </div>
        <div className="track-stat">
          <div className="track-stat-label"><Coins aria-hidden="true" />Koin/lap</div>
          <div className="track-stat-value reward-value">{rupiah(lapReward(game))}</div>
        </div>
      </div>
      <div className="race-actions">
        <Button variant="gold" className="boost-button" onClick={onBoost} disabled={disabled || game.cooldown > 0} style={{ "--charge": `${(1 - game.cooldown / 35) * 100}%` } as CSSProperties}>
          <Zap data-icon="inline-start" fill="currentColor" />
          <span>{boosted ? `NGACIR! ${Math.ceil(game.boostLeft)}s` : game.cooldown > 0 ? `Isi ulang ${Math.ceil(game.cooldown)}s` : "GASPOL 2×"}</span>
          {game.cooldown === 0 && <small>10s</small>}
        </Button>
      </div>
    </section>
  );
}

export function RaceReward({ pending, onClaim, disabled = false }: { pending: number; onClaim: () => void; disabled?: boolean }) {
  return (
    <section className={cn("race-reward", pending > 0 && "reward-ready")} aria-label="Hasil balapan">
      <div className="reward-copy">
        <span>Hasil balapan</span>
        <strong>{rupiah(pending)}</strong>
      </div>
      <Button variant={pending > 0 ? "gold" : "secondary"} disabled={disabled || pending <= 0} onClick={onClaim}>
        <Coins data-icon="inline-start" />Klaim
      </Button>
    </section>
  );
}
