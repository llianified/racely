"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Camera, ChevronDown, Coins, Flag, Gauge, LoaderCircle, Maximize, RotateCcw, Timer, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { batteryTelemetry, BOOST_DURATION_SECONDS, coins, formatCoins, lapReward, lapSeconds, type GameState } from "@/lib/game";
import { RaceBattery } from "./race-battery";
import { cn } from "@/lib/utils";
import { createDrivingState, stabilizeCar } from "@/lib/race-dynamics";
import { GripChallenge } from "./grip-challenge";

const RaceScene = dynamic(() => import("../scene/race-scene"), {
  ssr: false,
  loading: () => (
    <div className="scene-loading" role="status">
      <Flag aria-hidden="true" />
      <strong>Menyiapkan arena 3D…</strong>
    </div>
  ),
});

function subscribeMotionPreference(onChange: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function LapFeedback({ laps, reward, active }: { laps: number; reward: number; active: boolean }) {
  const previous = useRef({ laps, active });
  const [completed, setCompleted] = useState<{ lap: number; reward: number } | null>(null);

  useEffect(() => {
    const was = previous.current;
    previous.current = { laps, active };
    // Only celebrate a new visible lap, never hydration or background catch-up.
    if (active && was.active && !document.hidden && laps === was.laps + 1) {
      setCompleted({ lap: laps, reward });
    } else if (!active || document.hidden || laps !== was.laps) {
      setCompleted(null);
    }
  }, [laps, reward, active]);

  useEffect(() => {
    if (!completed) return;
    const hide = () => { if (document.hidden) setCompleted(null); };
    const timeout = window.setTimeout(() => setCompleted(null), 1600);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [completed]);

  return completed && active ? (
    <div key={completed.lap} className="lap-pop" aria-hidden="true">
      <Flag />
      <div>+{formatCoins(completed.reward)}<span>LAP {String(completed.lap).padStart(3, "0")} SELESAI</span></div>
    </div>
  ) : null;
}

export function RacePanel({ game, onBoost, onCircuits, active = true, disabled = false, boosting = false }: {
  game: GameState;
  onBoost: () => void;
  onCircuits: () => void;
  active?: boolean;
  disabled?: boolean;
  boosting?: boolean;
}) {
  const reducedMotion = useSyncExternalStore(subscribeMotionPreference, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => true);
  const driving = useRef(createDrivingState());
  const [telemetry, setTelemetry] = useState(createDrivingState);
  const [cinematic, setCinematic] = useState(true);
  const [cameraMode, setCameraMode] = useState(0);
  const [inspect, setInspect] = useState(false);
  const [bodyVisible, setBodyVisible] = useState(false);
  const battery = batteryTelemetry(game);
  const [cameraChoice, setCameraChoice] = useState<boolean | null>(null);
  const followCamera = cameraChoice ?? !reducedMotion;
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
        <span className="circuit-number" aria-label={`Sirkuit ${game.circuit + 1}`}>{String(game.circuit + 1).padStart(2, "0")}</span>
        <h2 className="track-title">
          <Button variant="ghost" size="sm" className="circuit-trigger" onClick={openCircuits} aria-label={`Pilih sirkuit: ${game.circuit ? "Midnight Speedway" : "Jakarta Raceway"}`} aria-haspopup="dialog">
            {game.circuit ? "Midnight Speedway" : "Jakarta Raceway"}
            <ChevronDown data-icon="inline-end" />
          </Button>
        </h2>
        <span className="live-tag">LIVE</span>
      </div>
      <div className={cn("scene-wrap", inspect && "is-inspecting", !inspect && cinematic && "is-cinematic", !inspect && telemetry.recovery > 0 && "is-course-out", !inspect && telemetry.grip < 40 && "is-grip-critical")}>
        {!inspect && <div className="race-vignette" aria-hidden="true" />}
        {!inspect && <div className="scene-overlay race-reward-hud"><span>REWARD / LAP</span><strong>+{formatCoins(lapReward(game))}<Coins aria-hidden="true" /></strong></div>}
        {!inspect && <div className="scene-overlay race-line-status" data-danger={telemetry.recovery > 0 || telemetry.grip < 40} data-perfect={telemetry.lineLocked || telemetry.perfectBoost > 0} role="status">
          {telemetry.recovery > 0 ? telemetry.offRoad ? 'OFF-ROAD / GRIP RENDAH' : 'RECOVERY / KEMBALI KE LINE' : telemetry.perfectBoost > 0 ? 'PERFECT EXIT / +22% AKSELERASI' : telemetry.lineLocked ? 'APEX LOCKED / SIAP MELAJU' : telemetry.grip < 40 ? 'TRACTION LOST / STABILKAN' : telemetry.corner ? 'CORNER / CARI APEX' : 'FLAT OUT / SIAPKAN TIKUNGAN'}
        </div>}
        {inspect ? <div className="scene-overlay inspect-hud"><strong>{bodyVisible ? "DETAIL MOBIL" : "DI BALIK BODI"}</strong><span>{bodyVisible ? "Cat metalik · ban · aero kit" : "2 sel · motor · penggerak 4WD"}</span></div> : <div className="scene-overlay lap-hud">
          <span>Lap server</span><strong>{String(game.laps + 1).padStart(3, "0")}</strong>
        </div>}
        <RaceScene driving={driving} onTelemetry={setTelemetry} cinematic={cinematic && !reducedMotion} levels={game.levels} model={game.carSelection?.model ?? 'neo-falcon'} progress={game.progress} seconds={seconds} color={game.color} boosted={boosted} cameraMode={cameraMode} followCamera={followCamera} resetKey={resetKey} circuit={game.circuit} active={active} reducedMotion={reducedMotion} inspect={inspect} charge={battery.charge} bodyVisible={bodyVisible} />
        <div className={cn("scene-overlay boost-hud", boosted && "boost-hud-active")} aria-hidden={!boosted}>
          <Zap aria-hidden="true" /><strong>2×</strong><span>GASPOL</span>
          <i style={{ transform: `scaleX(${Math.max(0, Math.min(1, game.boostLeft / BOOST_DURATION_SECONDS))})` }} />
        </div>
        {!inspect && <div className="scene-overlay race-speed-hud" aria-label="Kecepatan mobil di arena">
          <span><i style={{ backgroundColor: game.color }} />MOBILMU / 01</span>
          <strong>{(192 / seconds * telemetry.speedMultiplier).toFixed(1)}<small>KM/J</small></strong>
          <div className="race-speed-meter" aria-hidden="true"><i style={{ transform: `scaleX(${Math.min(1, telemetry.speedMultiplier * (boosted ? 1 : .5))})` }} /></div>
        </div>}
        {inspect && <div className="scene-overlay inspect-hint">Geser untuk memutar · balapan tetap jalan</div>}
        {!inspect && <div className="scene-boost-action">
          <Button variant="gold" size="sm" onClick={onBoost} disabled={disabled || boosting || !battery.canBoost} aria-busy={boosting}>
            {boosting ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Zap data-icon="inline-start" fill="currentColor" />}
            <span>{boosting ? 'Memulai…' : boosted ? 'Ngacir!' : game.cooldown > 0 ? 'Isi daya' : 'Gaspol 2×'}</span>
            {!boosting && <small>{boosted ? `${Math.ceil(game.boostLeft)}s` : game.cooldown > 0 ? `${Math.ceil(game.cooldown)}s` : '10s'}</small>}
          </Button>
        </div>}
        <div className="scene-controls">
          {inspect ? <>
            <Button variant="outline" size="sm" onClick={() => setBodyVisible(value => !value)} aria-pressed={bodyVisible} aria-label={bodyVisible ? "Lepas bodi untuk melihat baterai" : "Pasang bodi untuk melihat detail mobil"}>{bodyVisible ? "Lepas bodi" : "Pasang bodi"}</Button>
            <Button variant="outline" size="sm" onClick={() => setInspect(false)}><Camera data-icon="inline-start" />Balapan</Button>
          </> : <>
          <Button variant="outline" size="sm" onClick={() => setCameraChoice(!followCamera)} aria-pressed={!followCamera} aria-label={followCamera ? "Aktifkan kamera overview" : "Kembali ke kamera follow mobil"} title={followCamera ? "Lihat seluruh lintasan" : "Kembali mengikuti mobil"}>
            <Camera data-icon="inline-start" aria-hidden="true" />
            {followCamera ? 'Overview' : 'Follow'}
          </Button>
          {!followCamera && <Button variant="outline" size="icon-sm" onClick={() => setCameraMode((v) => (v + 1) % 3)} aria-label={`Ganti sudut overview, preset ${cameraMode + 1} dari 3`} title={`Sudut overview ${cameraMode + 1}/3`}>
            <span aria-hidden="true">{cameraMode + 1}/3</span>
          </Button>}
          <Button variant="outline" size="icon-sm" onClick={() => { setCameraChoice(null); setCameraMode(0); setResetKey((v) => v + 1); }} aria-label={reducedMotion ? "Reset kamera ke overview" : "Reset kamera ke follow mobil"}>
            <RotateCcw aria-hidden="true" />
          </Button>
          </>}
          <Button variant="outline" size="icon-sm" onClick={fullscreen} aria-label="Layar penuh">
            <Maximize aria-hidden="true" />
          </Button>
        </div>
        <LapFeedback laps={game.laps} reward={lapReward(game)} active={active && !inspect} />
      </div>
      <div className="lap-progress" role="progressbar" aria-label="Progres putaran saat ini" aria-valuenow={Math.round(game.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ transform: `scaleX(${game.progress})` }} />
      </div>
      <div className="race-director-bar">
        <span>{followCamera ? 'CHASE CAM' : `OVERVIEW / 0${cameraMode + 1}`}<i />{reducedMotion ? 'REDUCED MOTION' : cinematic ? 'DIRECTOR LIVE' : 'KAMERA STABIL'}</span>
        <Button variant="ghost" size="xs" aria-pressed={cinematic && !reducedMotion} disabled={reducedMotion} onClick={() => setCinematic(value => !value)}>Sinematik {cinematic && !reducedMotion ? 'on' : 'off'}</Button>
      </div>
      {!inspect && <GripChallenge state={telemetry} active={active} onStabilize={() => {
        if (active && stabilizeCar(driving.current)) setTelemetry({ ...driving.current });
      }} onToggle={() => {
        const enabled = !driving.current.enabled;
        Object.assign(driving.current, createDrivingState(), { enabled });
        setTelemetry({ ...driving.current });
      }} />}
      <div className="track-stats">
        <div className="track-stat">
          <div className="track-stat-label"><Gauge aria-hidden="true" />Kecepatan</div>
          <div className="track-stat-value">{(192 / seconds * telemetry.speedMultiplier).toFixed(1)} <small>km/j</small></div>
        </div>
        <div className="track-stat">
          <div className="track-stat-label"><Timer aria-hidden="true" />Waktu/lap</div>
          <div className="track-stat-value">{seconds.toFixed(2)} <small>d</small></div>
        </div>
        <div className="track-stat">
          <div className="track-stat-label"><Coins aria-hidden="true" />Koin/lap</div>
          <div className="track-stat-value reward-value">{formatCoins(lapReward(game))}</div>
        </div>
      </div>
      <RaceBattery game={game} inspect={inspect} onInspect={() => {
        setInspect(value => !value);
        panel.current?.scrollIntoView({ block: "start", behavior: reducedMotion ? "instant" : "smooth" });
      }} />

    </section>
  );
}

export function RaceReward({ pending, onClaim, disabled = false, claiming = false }: { pending: number; onClaim: () => void; disabled?: boolean; claiming?: boolean }) {
  return (
    <section className={cn("race-reward", pending >= 1 && "reward-ready")} aria-label="Hasil balapan">
      <div className="reward-copy">
        <span>Hasil balapan</span>
        <strong>{coins(pending)}</strong>
        <small>{pending >= 1 ? "Siap masuk ke saldo" : "Terkumpul setiap putaran"}</small>
      </div>
      <Button variant={pending >= 1 ? "gold" : "secondary"} disabled={disabled || pending < 1} onClick={onClaim} aria-busy={claiming}>
        <Coins data-icon="inline-start" />{claiming ? "Mengklaim…" : "Klaim"}
      </Button>
    </section>
  );
}
