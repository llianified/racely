"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Camera, ChevronDown, Coins, Flag, Gauge, LoaderCircle, Maximize, RotateCcw, Timer, Zap, Route } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { batteryTelemetry, coins, displaySpeedKmh, formatCoins, lapReward, lapSeconds, type GameState } from "@/lib/game";
import { RaceBattery } from "./race-battery";
import { cn } from "@/lib/utils";
import { createDrivingState } from "@/lib/race-dynamics";
import { createClubRace } from "@/lib/club-race";
import { raceTrack } from "@/lib/race-tracks";
import { GripChallenge } from "./grip-challenge";
import { RaceHud } from "./race-hud";
import { ClubPanel } from "./club-panel";

const RaceScene = dynamic(() => import("../scene/race-scene"), {
  ssr: false,
  loading: () => <div className="scene-loading" role="status"><Flag aria-hidden="true" /><strong>Menyiapkan arena 3D…</strong></div>,
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
    if (active && was.active && !document.hidden && laps === was.laps + 1) setCompleted({ lap: laps, reward });
    else if (!active || document.hidden || laps !== was.laps) setCompleted(null);
  }, [laps, reward, active]);
  useEffect(() => {
    if (!completed) return;
    const hide = () => { if (document.hidden) setCompleted(null); };
    const timeout = window.setTimeout(() => setCompleted(null), 1600);
    document.addEventListener("visibilitychange", hide);
    return () => { window.clearTimeout(timeout); document.removeEventListener("visibilitychange", hide); };
  }, [completed]);
  return completed && active ? <div key={completed.lap} className="lap-pop" aria-hidden="true"><Flag /><div>+{formatCoins(completed.reward)}<span>LAP {String(completed.lap).padStart(3, "0")} SELESAI</span></div></div> : null;
}

export function RacePanel({ game, onBoost, onCircuits, active = true, disabled = false, boosting = false }: {
  game: GameState; onBoost: () => void; onCircuits: () => void; active?: boolean; disabled?: boolean; boosting?: boolean;
}) {
  const reducedMotion = useSyncExternalStore(subscribeMotionPreference, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => true);
  const driving = useRef(createDrivingState());
  const race = useRef(createClubRace());
  const [raceTelemetry, setRaceTelemetry] = useState(createClubRace);
  const [telemetry, setTelemetry] = useState(createDrivingState);
  const [selectedTrack, setSelectedTrack] = useState(0);
  const [sceneReady, setSceneReady] = useState(false);
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
  const practice = raceTelemetry.status !== "idle";
  const displayedTrack = practice ? raceTelemetry.track : game.circuit;
  const progress = practice ? raceTelemetry.status === "finished" ? 1 : raceTelemetry.racers[0].distance % 1 : game.progress;
  const resetDriving = (enabled = true) => { Object.assign(driving.current, createDrivingState(), { enabled }); setTelemetry({ ...driving.current }); };
  const startRace = () => {
    if (!sceneReady || disabled || game.laps < raceTrack(selectedTrack).unlock || race.current.status === "racing" || race.current.status === "countdown") return;
    race.current = { ...createClubRace(selectedTrack, lapSeconds({ ...game, boostLeft: 0 })), status: "countdown" };
    resetDriving();
    setRaceTelemetry({ ...race.current });
    setInspect(false);
    setResetKey(value => value + 1);
    panel.current?.scrollIntoView({ block: "start", behavior: reducedMotion ? "instant" : "smooth" });
  };
  const exitRace = () => { race.current = createClubRace(); setRaceTelemetry({ ...race.current }); resetDriving(); setResetKey(value => value + 1); };
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (panel.current?.requestFullscreen) await panel.current.requestFullscreen();
      else toast.info("Putar perangkat untuk arena yang lebih luas.");
    } catch { toast.info("Layar penuh tidak tersedia. Kamu tetap bisa memutar dan memperbesar lintasan."); }
  };
  const openCircuits = async () => {
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); }
      catch { toast.info("Keluar dari layar penuh untuk memilih sirkuit."); return; }
    }
    onCircuits();
  };
  return <>
    <section className="panel track-panel" ref={panel} aria-label={practice ? "Club Run melawan CPU" : "Balapan otomatis"}>
      <div className="track-top">
        <span className="circuit-number">{String(displayedTrack + 1).padStart(2, "0")}</span>
        <div className="track-title"><span className="eyebrow">{practice ? "CLUB RUN / LATIHAN" : "NIGHT SESSION / AUTO RACE"}</span><h2>
          {practice ? <span className="practice-track-name">{raceTrack(displayedTrack).name}</span> : <Button variant="ghost" size="sm" className="circuit-trigger" onClick={openCircuits} aria-label={`Pilih sirkuit: ${game.circuit ? "Midnight Speedway" : "Jakarta Raceway"}`} aria-haspopup="dialog">{game.circuit ? "Midnight Speedway" : "Jakarta Raceway"}<ChevronDown data-icon="inline-end" /></Button>}
        </h2></div><span className="live-tag">{raceTelemetry.status === "finished" ? "FINISH" : "LIVE"}</span>
      </div>
      <div className={cn("scene-wrap", inspect && "is-inspecting", !inspect && cinematic && "is-cinematic", !inspect && telemetry.recovery > 0 && "is-course-out", !inspect && telemetry.grip < 40 && "is-grip-critical")}>
        {!inspect && <div className="race-vignette" aria-hidden="true" />}
        {inspect && <div className="scene-overlay inspect-hud"><strong>{bodyVisible ? "DETAIL MOBIL" : "DI BALIK BODI"}</strong><span>{bodyVisible ? "Cat metalik · ban · aero kit" : "2 sel · motor · penggerak 4WD"}</span></div>}
        <RaceScene equipped={game.bodyParts?.equipped} driving={driving} onTelemetry={setTelemetry} race={race} onRaceTelemetry={setRaceTelemetry} onReady={setSceneReady} track={displayedTrack} cinematic={cinematic && !reducedMotion} levels={game.levels} model={game.carSelection?.model ?? "neo-falcon"} progress={game.progress} seconds={seconds} color={game.color} boosted={boosted} cameraMode={cameraMode} followCamera={followCamera} resetKey={resetKey} circuit={game.circuit} active={active} reducedMotion={reducedMotion} inspect={inspect} charge={battery.charge} bodyVisible={bodyVisible} />
        {!inspect && sceneReady && <RaceHud game={game} driving={telemetry} race={raceTelemetry} />}
        {!inspect && sceneReady && telemetry.recovery > 0 && <div className="course-out-callout" role="status"><strong>{telemetry.offRoad ? "COURSE OUT" : "RECOVERING"}</strong><span>{practice ? "Kecepatan turun · kembali ke line" : "Simulasi grip · koin tetap berjalan"}</span></div>}
        {inspect && <div className="scene-overlay inspect-hint">Geser untuk memutar · {practice ? "Club Run dijeda" : "balapan tetap jalan"}</div>}
        <LapFeedback laps={game.laps} reward={lapReward(game)} active={active && !inspect && !practice} />
      </div>
      <div className="lap-progress" role="progressbar" aria-label={practice ? "Progres lap latihan" : "Progres putaran saat ini"} aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}><div style={{ transform: `scaleX(${progress})` }} /></div>
      <div className="scene-controls" role="group" aria-label="Kontrol balapan dan kamera">
        {inspect ? <><Button variant="outline" size="sm" onClick={() => setBodyVisible(value => !value)} aria-pressed={bodyVisible}>{bodyVisible ? "Lepas bodi" : "Pasang bodi"}</Button><Button variant="outline" size="sm" onClick={() => setInspect(false)}><Camera data-icon="inline-start" />Balapan</Button></> : <>
          <Button variant="outline" size="sm" onClick={() => setCameraChoice(!followCamera)} aria-pressed={!followCamera} aria-label={followCamera ? "Aktifkan kamera overview" : "Kembali ke kamera follow mobil"}><Camera data-icon="inline-start" />{followCamera ? "Overview" : "Follow"}</Button>
          <Button variant="outline" size="icon-sm" onClick={() => { setCameraChoice(null); setCameraMode(0); setResetKey(value => value + 1); }} aria-label="Reset kamera"><RotateCcw /></Button>
        </>}
        <Button variant="outline" size="icon-sm" onClick={fullscreen} aria-label="Layar penuh"><Maximize /></Button>
        {!inspect && <Button className="race-boost-action" variant="gold" size="sm" onClick={onBoost} disabled={disabled || boosting || !battery.canBoost || raceTelemetry.status === "countdown" || raceTelemetry.status === "finished"} aria-busy={boosting}>{boosting ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Zap data-icon="inline-start" fill="currentColor" />}<span>{boosting ? "Memulai…" : boosted ? "Ngacir!" : game.cooldown > 0 ? "Isi daya" : "Gaspol 2×"}</span>{!boosting && (boosted || game.cooldown > 0) && <small>{Math.ceil(boosted ? game.boostLeft : game.cooldown)}s</small>}</Button>}
      </div>
      {practice && !inspect && <div className="apex-control" data-active={telemetry.lineAssist}><div><strong>{telemetry.perfectBoost > 0 ? "Perfect exit · +16%" : "Pelan di apex. Cepat saat keluar."}</strong><span>Aktifkan sebelum tikungan, tanpa boost.</span></div><Button size="sm" variant={telemetry.lineAssist ? "secondary" : "outline"} aria-pressed={telemetry.lineAssist} disabled={raceTelemetry.status === "finished"} onClick={() => { driving.current.lineAssist = !driving.current.lineAssist; setTelemetry({ ...driving.current }); }}><Route data-icon="inline-start" />Jaga line</Button></div>}
      <div className="track-stats" aria-label="Performa balapan otomatis dan koin server">
        <div className="track-stat"><div className="track-stat-label"><Gauge aria-hidden="true" />Est. laju</div><div className="track-stat-value">{displaySpeedKmh(seconds).toFixed(1)} <small>km/j</small></div></div>
        <div className="track-stat"><div className="track-stat-label"><Timer aria-hidden="true" />Lap server</div><div className="track-stat-value">{seconds.toFixed(2)} <small>d</small></div></div>
        <div className="track-stat"><div className="track-stat-label"><Coins aria-hidden="true" />Koin/lap</div><div className="track-stat-value reward-value">{formatCoins(lapReward(game))}</div></div>
      </div>
      <RaceBattery game={game} inspect={inspect} onInspect={() => { setInspect(value => !value); panel.current?.scrollIntoView({ block: "start", behavior: reducedMotion ? "instant" : "smooth" }); }} />
      <details className="race-settings"><summary>Pengaturan balapan<ChevronDown aria-hidden="true" /></summary>
        <div className="race-director-bar"><span>{reducedMotion ? "GERAK DIKURANGI" : "KAMERA SINEMATIK"}</span><Button variant="ghost" size="xs" aria-label="Kamera sinematik" aria-pressed={cinematic && !reducedMotion} disabled={reducedMotion} onClick={() => setCinematic(value => !value)}>{cinematic && !reducedMotion ? "Aktif" : "Nonaktif"}</Button></div>
        {!inspect && !followCamera && <div className="race-director-bar"><span>SUDUT OVERVIEW</span><Button variant="outline" size="sm" onClick={() => setCameraMode(value => (value + 1) % 3)} aria-label={`Ganti sudut overview, preset ${cameraMode + 1} dari 3`}>{cameraMode + 1}/3</Button></div>}
        {!inspect && !practice && <GripChallenge state={telemetry} tires={game.levels.tires} onToggle={() => resetDriving(!driving.current.enabled)} />}
        <p className="instrument-help">RPM dan V-Gear adalah instrumen virtual, bukan transmisi fisik mini 4WD. Di Club Run, grip dan perfect exit memengaruhi laju latihan; ekonomi server tidak berubah.</p>
      </details>
    </section>
    <ClubPanel game={game} race={raceTelemetry} driving={telemetry} selected={selectedTrack} onSelect={id => { if (game.laps >= raceTrack(id).unlock) { exitRace(); setSelectedTrack(id); } }} onStart={startRace} onExit={exitRace} disabled={disabled || !sceneReady} />
  </>;
}

export function RaceReward({ pending, onClaim, disabled = false, claiming = false }: { pending: number; onClaim: () => void; disabled?: boolean; claiming?: boolean }) {
  return <section className={cn("race-reward", pending >= 1 && "reward-ready")} aria-label="Hasil balapan"><div className="reward-copy"><span>Hasil balapan</span><strong>{coins(pending)}</strong><small>{pending >= 1 ? "Siap masuk ke saldo" : "Terkumpul setiap putaran"}</small></div><Button variant={pending >= 1 ? "gold" : "secondary"} disabled={disabled || pending < 1} onClick={onClaim} aria-busy={claiming}><Coins data-icon="inline-start" />{claiming ? "Mengklaim…" : "Klaim"}</Button></section>;
}
