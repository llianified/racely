"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Camera,
  Check,
  Coins,
  Flag,
  Gauge,
  Maximize,
  Move,
  RotateCcw,
  Timer,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { lapReward, lapSeconds, rupiah, type GameState } from "@/lib/game";
import { cn } from "@/lib/utils";

const RaceScene = dynamic(() => import("./race-scene"), {
  ssr: false,
  loading: () => (
    <div className="scene-loading" role="status">
      <Flag />
      <strong>Menyiapkan balapanmu.</strong>
      <span>Menyiapkan arena 3D…</span>
    </div>
  ),
});

export function RacePanel({
  game,
  onBoost,
  disabled = false,
}: {
  game: GameState;
  onBoost: () => void;
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
      else if (panel.current?.requestFullscreen)
        await panel.current.requestFullscreen();
      else toast.info("Putar perangkat untuk arena yang lebih luas.");
    } catch {
      toast.info(
        "Layar penuh tidak tersedia. Kamu tetap bisa memutar dan memperbesar lintasan.",
      );
    }
  };
  return (
    <section
      className={cn("panel track-panel", boosted && "is-boosted")}
      ref={panel}
      aria-label="Balapan otomatis"
    >
      <div className="track-top">
        <div className="track-title">
          <span className="circuit-number">0{game.circuit + 1}</span>
          <div>
            <span className="eyebrow">NIGHT CIRCUIT</span>
            <h2>{game.circuit ? "Midnight Speedway" : "Jakarta Raceway"}</h2>
          </div>
        </div>
        <span className="live-tag">AUTO RACE</span>
      </div>
      <div className="scene-wrap">
        <div className="scene-overlay lap-hud">
          <div>
            <span className="eyebrow">LAP</span>
            <strong>{String(game.laps + 1).padStart(3, "0")}</strong>
          </div>
          <span className="lap-divider" />
          <div>
            <span className="eyebrow">MOBIL KAMU</span>
            <span className="hud-car">
              <i style={{ background: game.color }} />
              Neo Falcon
            </span>
          </div>
        </div>
        <RaceScene
          progress={game.progress}
          seconds={seconds}
          color={game.color}
          boosted={boosted}
          cameraMode={cameraMode}
          resetKey={resetKey}
          circuit={game.circuit}
        />
        {boosted && (
          <div className="scene-overlay boost-hud">
            <Zap size={14} fill="currentColor" />
            2× BOOST AKTIF
          </div>
        )}
        <div className="scene-overlay scene-hint">
          <Move size={12} />
          <span>Geser untuk orbit · cubit untuk zoom</span>
        </div>
        <div className="scene-controls">
          <button
            onClick={() => setCameraMode((v) => (v + 1) % 3)}
            title="Ganti sudut kamera"
            aria-label="Ganti sudut kamera"
          >
            <Camera />
          </button>
          <button
            onClick={() => {
              setCameraMode(0);
              setResetKey((v) => v + 1);
            }}
            title="Reset kamera"
            aria-label="Reset kamera"
          >
            <RotateCcw />
          </button>
          <button
            onClick={fullscreen}
            title="Layar penuh"
            aria-label="Layar penuh"
          >
            <Maximize />
          </button>
        </div>
        <div key={game.laps} className="lap-pop" aria-hidden="true">
          {game.laps > 0 && (
            <>
              +{rupiah(lapReward(game))}
              <span>PUTARAN SELESAI</span>
            </>
          )}
        </div>
      </div>
      <div
        className="lap-progress"
        role="progressbar"
        aria-label="Progres putaran saat ini"
        aria-valuenow={Math.round(game.progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div style={{ transform: `scaleX(${game.progress})` }} />
      </div>
      <div className="track-stats">
        <div className="track-stat">
          <div className="track-stat-label">
            <Gauge />
            Kecepatan
          </div>
          <div className="track-stat-value">
            {(192 / seconds).toFixed(1)} <small>km/j</small>
          </div>
        </div>
        <div className="track-stat">
          <div className="track-stat-label">
            <Timer />
            Waktu / lap
          </div>
          <div className="track-stat-value">
            {seconds.toFixed(2)} <small>detik</small>
          </div>
        </div>
        <div className="track-stat">
          <div className="track-stat-label">
            <Coins />
            Koin / lap
          </div>
          <div className="track-stat-value reward-value">
            {rupiah(lapReward(game))}
            <small>virtual</small>
          </div>
        </div>
      </div>
      <div className="race-actions">
        <div>
          <p className="auto-caption">
            <span className="activity-dot" />
            Mobil jalan. Koin nambah.
          </p>
          <p className="auto-detail">
            2 bot latihan · tanpa perlu menekan start
          </p>
        </div>
        <button
          className="boost-button"
          onClick={onBoost}
          disabled={disabled || game.cooldown > 0}
          style={
            {
              "--charge": `${(1 - game.cooldown / 35) * 100}%`,
            } as CSSProperties
          }
        >
          <Zap size={17} fill="currentColor" />
          <span>
            {boosted
              ? `NGACIR! ${Math.ceil(game.boostLeft)}s`
              : game.cooldown > 0
                ? `Isi ulang ${Math.ceil(game.cooldown)}s`
                : "GASPOL 2×"}
          </span>
          {game.cooldown === 0 && <small>10s</small>}
        </button>
      </div>
    </section>
  );
}

export function RaceReward({
  pending,
  onClaim,
  disabled = false,
}: {
  pending: number;
  onClaim: () => void;
  disabled?: boolean;
}) {
  const [claimed, setClaimed] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timeout.current) clearTimeout(timeout.current);
    },
    [],
  );
  return (
    <section
      className={cn("race-reward", pending > 0 && "reward-ready")}
      aria-label="Hasil balapan"
    >
      <div className="reward-coin">
        <Coins />
      </div>
      <div className="reward-copy">
        <span>{pending > 0 ? "HASIL BALAPAN" : "MENGUMPULKAN KOIN"}</span>
        <strong>
          {rupiah(pending)} <small>virtual</small>
        </strong>
      </div>
      <Button
        disabled={disabled || pending <= 0}
        onClick={() => {
          onClaim();
          setClaimed(true);
          if (timeout.current) clearTimeout(timeout.current);
          timeout.current = setTimeout(() => setClaimed(false), 1800);
        }}
      >
        {claimed && pending <= 0 ? (
          <>
            <Check data-icon="inline-start" />
            Diklaim!
          </>
        ) : (
          <>
            <Coins data-icon="inline-start" />
            Klaim hasil
          </>
        )}
      </Button>
    </section>
  );
}
