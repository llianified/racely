"use client";

import dynamic from "next/dynamic";
import { useId, useRef, useState, useSyncExternalStore } from "react";
import { Camera, ChevronDown, Clapperboard, Coins, Flag, LoaderCircle, Maximize, Minimize, RotateCcw, SlidersHorizontal, SwitchCamera, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { batteryTelemetry, carSetup, coins, formatCoins, lapReward, lapSeconds, racePosition, type AdReward, type GameState } from "@/lib/game";
import { RaceOverviewHud, RacePositionHud } from "./race-overview-hud";
import { cn } from "@/lib/utils";
import { createDrivingState } from "@/lib/race-dynamics";
import { raceTrackAt } from '@/lib/race-track';
import { LAST_CIRCUIT, circuitName } from "@/lib/track-layout";
import { circuitUnlockLaps } from "@/lib/economy-config";
import { RaceSwitch, SettingRow } from "./setting-row";
import { NEUTRAL_SETUP } from "@/lib/car-setup";
import { opponentDistance } from '@/lib/race-opponents';
import { RaceStandings } from './race-standings';
import { useRaceAudio } from './use-race-audio';

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

function subscribeFullscreen(onChange: () => void) {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}

export function RacePanel({ game, onCircuits, active = true }: {
  game: GameState;
  onCircuits: () => void;
  active?: boolean;
}) {
  const reducedMotion = useSyncExternalStore(subscribeMotionPreference, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => true);
  const driving = useRef(createDrivingState());
  const sound = useRaceAudio(game.laps, active);
  const [telemetry, setTelemetry] = useState(createDrivingState);
  const [cinematic, setCinematic] = useState(true);
  const [cameraMode, setCameraMode] = useState(0);
  const [inspect, setInspect] = useState(false);
  const [bodyVisible, setBodyVisible] = useState(false);
  // Arena melaporkan sendiri kapan lintasannya tampil; overlay HUD ikut padam
  // selama placeholder supaya pesan "muat ulang arena" tidak tertutup chip.
  const [sceneLive, setSceneLive] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsId = useId();
  const battery = batteryTelemetry(game);
  const [cameraChoice, setCameraChoice] = useState<boolean | null>(null);
  const followCamera = cameraChoice ?? !reducedMotion;
  const [resetKey, setResetKey] = useState(0);
  const [controlFeedback, setControlFeedback] = useState("");
  const panel = useRef<HTMLElement>(null);
  const isFullscreen = useSyncExternalStore(
    subscribeFullscreen,
    () => document.fullscreenElement === panel.current,
    () => false,
  );
  const seconds = lapSeconds(game);
  // Setup speed and recovery are animated in the scene, not applied twice.
  const baseSeconds = lapSeconds({ ...game, boostLeft: 0, setup: NEUTRAL_SETUP });
  const opponents = game.rivals?.opponents ?? [];
  const opponentProgress = opponents.map(opponent => opponentDistance(opponent, game.economy, game.rivals?.elapsedSeconds));
  const position = racePosition(game);
  const lane = raceTrackAt(game.circuit).route.profile(game.laps + game.progress, 0);
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setControlFeedback("Layar penuh ditutup.");
      } else if (panel.current?.requestFullscreen) {
        await panel.current.requestFullscreen();
        setControlFeedback("Layar penuh aktif.");
      } else {
        toast.info("Putar perangkat");
      }
    } catch {
      toast.info("Layar penuh tak tersedia");
    }
  };
  // Kail progresi ikut di kepala panel: di layar 384x595 kartu "Trek berikutnya"
  // baru terlihat setelah menggulir, padahal itu satu-satunya alasan pemain
  // balik besok. Ambangnya tetap dibaca dari config, sama seperti CircuitPanel.
  const nextCircuit = Math.min(game.circuit + 1, LAST_CIRCUIT);
  const unlockLaps = circuitUnlockLaps(game.economy, nextCircuit);
  // Hanya selama masih ada trek berikutnya: ambangnya bisa dinaikkan operator
  // lewat /admin setelah pemain pindah, dan kail menuju trek berikutnya tidak
  // boleh muncul di kepala panel pemain yang sudah di trek terakhir.
  const lapsToUnlock = game.circuit < LAST_CIRCUIT ? Math.max(0, unlockLaps - game.laps) : 0;
  const nextCircuitShortName = circuitName(nextCircuit).split(" ")[0];
  const openCircuits = async () => {
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); }
      catch { toast.info("Tutup layar penuh dulu"); return; }
    }
    onCircuits();
  };
  return (
    <section className="panel track-panel" ref={panel} aria-label="Balapan otomatis">
      <div className="track-top">
        <span className="circuit-number" aria-label={`Sirkuit ${game.circuit + 1}`}>{String(game.circuit + 1).padStart(2, "0")}</span>
        <h2 className="track-title">
          <Button variant="ghost" size="sm" className="circuit-trigger" onClick={openCircuits} aria-label={`Pilih sirkuit: ${circuitName(game.circuit)}`} aria-haspopup="dialog">
            {circuitName(game.circuit)}
            <ChevronDown data-icon="inline-end" />
          </Button>
        </h2>
        {lapsToUnlock > 0 && (
          <div className="track-unlock">
            <span>{lapsToUnlock} lap lagi → {nextCircuitShortName}</span>
            <Progress
              value={Math.min((game.laps / unlockLaps) * 100, 100)}
              aria-label={`${circuitName(nextCircuit)} terbuka setelah ${lapsToUnlock} putaran lagi`}
              className="flex-1"
            />
          </div>
        )}
      </div>
      <div className={cn("scene-wrap", inspect && "is-inspecting", !inspect && cinematic && "is-cinematic", !inspect && telemetry.recovery > 0 && "is-course-out", !inspect && telemetry.grip < 40 && "is-grip-critical")}>
        {!inspect && sceneLive && <div className="race-vignette" aria-hidden="true" />}
        {!inspect && sceneLive && <RacePositionHud lane={lane.lane + 1} switching={lane.feature === 'lane-changer'} telemetry={telemetry} position={position} total={opponents.length + 1} followCamera={followCamera} recovering={telemetry.recovery > 0} />}
        {inspect && <div className="scene-overlay inspect-hud"><strong>{bodyVisible ? "DETAIL MOBIL" : "DI BALIK BODI"}</strong><span>{bodyVisible ? "Cat metalik · ban · aero kit" : "2 sel · motor · penggerak 4WD"}</span></div>}
        <RaceScene setup={carSetup(game)} equipped={game.bodyParts?.equipped} driving={driving} onTelemetry={setTelemetry} cinematic={cinematic && !reducedMotion} levels={game.levels} model={game.carSelection?.model ?? 'neo-falcon'} progress={game.laps + game.progress} seconds={seconds} baseSeconds={baseSeconds} opponents={opponents} opponentProgress={opponentProgress} color={game.color} cameraMode={cameraMode} followCamera={followCamera} resetKey={resetKey} circuit={game.circuit} active={active} reducedMotion={reducedMotion} inspect={inspect} charge={battery.charge} bodyVisible={bodyVisible} onSceneStatus={setSceneLive} />
        {inspect && <div className="scene-overlay inspect-hint">Geser untuk memutar · balapan tetap jalan</div>}
      </div>
      {!inspect && <RaceOverviewHud seconds={seconds} baseSeconds={baseSeconds} reward={lapReward(game)} progress={game.progress} telemetry={telemetry} laps={game.laps} />}
      <RaceStandings game={game} />
      <div className="scene-controls" role="group" aria-label="Kontrol balapan dan kamera">
          {inspect ? <>
            <Button variant="outline" size="sm" onClick={() => setBodyVisible(value => !value)} aria-pressed={bodyVisible} aria-label={bodyVisible ? "Lepas bodi untuk melihat baterai" : "Pasang bodi untuk melihat detail mobil"}>{bodyVisible ? "Lepas bodi" : "Pasang bodi"}</Button>
            <Button variant="outline" size="sm" onClick={() => setInspect(false)}><Camera data-icon="inline-start" />Balapan</Button>
          </> : <>
          <Button variant="outline" size="icon-sm" onClick={() => {
            const nextFollowCamera = !followCamera;
            setCameraChoice(nextFollowCamera);
            setControlFeedback(nextFollowCamera ? "Kamera kembali mengikuti mobil." : "Kamera overview aktif. Geser lintasan untuk memutar.");
          }} aria-pressed={!followCamera} aria-label={followCamera ? "Aktifkan kamera overview" : "Kembali ke kamera follow mobil"} title={followCamera ? "Lihat seluruh lintasan" : "Kembali mengikuti mobil"}>
            <SwitchCamera aria-hidden="true" />
          </Button>
          </>}
          <Button variant="outline" size="icon-sm" onClick={sound.toggle} disabled={sound.pending} aria-busy={sound.pending} aria-pressed={sound.enabled} aria-label={sound.enabled ? "Matikan suara balapan" : "Aktifkan suara balapan"} title={sound.enabled ? "Matikan suara" : "Aktifkan suara"}>
            {sound.enabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
          </Button>
          <Button variant="outline" size="icon-sm" onClick={fullscreen} aria-label={isFullscreen ? "Keluar dari layar penuh" : "Buka layar penuh"} title={isFullscreen ? "Keluar layar penuh" : "Layar penuh"}>
            {isFullscreen ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => setSettingsOpen(value => !value)} aria-expanded={settingsOpen} aria-controls={settingsId} aria-label="Pengaturan balapan" title="Pengaturan balapan">
            <SlidersHorizontal aria-hidden="true" />
          </Button>
          <span className="sr-only" role="status" aria-live="polite">{controlFeedback}</span>
      </div>
      <section className="race-settings" id={settingsId} hidden={!settingsOpen} aria-label="Pengaturan balapan">
        <div className="race-settings-group" role="group" aria-labelledby={`${settingsId}-camera`}>
          <h3 className="race-settings-title" id={`${settingsId}-camera`}>Kamera</h3>
          <SettingRow label="Kamera sinematik" hint={reducedMotion ? 'Nonaktif karena perangkat mengurangi gerak' : 'Kamera bergerak dinamis mengikuti balapan'}>
            <RaceSwitch checked={cinematic && !reducedMotion} disabled={reducedMotion} label="Kamera sinematik" onChange={() => setCinematic(value => !value)} />
          </SettingRow>
          {!inspect && !followCamera && <SettingRow label="Sudut overview" hint={`Preset ${cameraMode + 1} dari 3`}>
            <Button variant="outline" size="sm" onClick={() => setCameraMode((v) => (v + 1) % 3)} aria-label={`Ganti sudut overview, sekarang preset ${cameraMode + 1} dari 3`}>Ganti</Button>
          </SettingRow>}
          <SettingRow label="Posisi kamera" hint="Kembalikan ke tampilan awal">
            <Button variant="outline" size="sm" onClick={() => {
              setCameraChoice(null);
              setCameraMode(0);
              setResetKey(value => value + 1);
              setControlFeedback(reducedMotion ? "Kamera direset ke overview." : "Kamera direset untuk mengikuti mobil.");
            }}><RotateCcw data-icon="inline-start" />Reset</Button>
          </SettingRow>
        </div>
        <div className="race-settings-group" role="group" aria-labelledby={`${settingsId}-audio`}>
          <h3 className="race-settings-title" id={`${settingsId}-audio`}>Suara</h3>
          <SettingRow label="Audio balapan" hint="Ding singkat saat lap bertambah, tanpa suara mobil">
            <RaceSwitch checked={sound.enabled} disabled={sound.pending} label="Audio balapan" onChange={sound.toggle} />
          </SettingRow>
          <SettingRow label="Volume" hint={`${sound.volume}% · dijeda saat meninggalkan arena`}>
            <input className="race-volume" type="range" min={0} max={100} step={5} value={sound.volume} onChange={event => sound.changeVolume(Number(event.target.value))} aria-label="Volume suara balapan" aria-valuetext={`${sound.volume}%`} />
          </SettingRow>
        </div>
        <div className="race-settings-group" role="group" aria-labelledby={`${settingsId}-sim`}>
          <h3 className="race-settings-title" id={`${settingsId}-sim`}>Simulasi arena <small>Hanya tampilan</small></h3>
          <SettingRow label="Inspeksi mobil" hint={inspect ? 'Sedang melihat sasis' : 'Putar mobil, lihat sasis & baterai'}>
            <Button variant="outline" size="sm" aria-pressed={inspect} onClick={() => {
              setInspect(value => !value);
              panel.current?.scrollIntoView({ block: "start", behavior: reducedMotion ? "instant" : "smooth" });
            }}>{inspect ? "Kembali balapan" : "Lihat sasis"}</Button>
          </SettingRow>
        </div>
        <p className="race-settings-note">Arena mengilustrasikan laju, beban tikungan, dan rate course-out setup; bukan replay kejadian server. Lap dan koin tetap mengikuti server.</p>
      </section>
    </section>
  );
}

export function RaceReward({ pending, onClaim, disabled = false, claiming = false }: { pending: number; onClaim: () => void; disabled?: boolean; claiming?: boolean }) {
  const readyToClaim = pending >= 1;
  const rewardStatus = readyToClaim
    ? "Siap diklaim"
    : pending > 0
      ? `${formatCoins(1 - pending)} koin lagi untuk klaim`
      : "Selesaikan putaran untuk mulai mengumpulkan";

  return (
    <section className={cn("race-reward", readyToClaim && "reward-ready")} aria-label="Hasil balapan">
      <div className="reward-copy">
        <h2 className="reward-heading">Hasil balapan</h2>
        <strong>{formatCoins(pending)} <span>koin</span></strong>
        <span className="reward-status" title={rewardStatus}>
          {readyToClaim ? "Siap diklaim" : "Mengumpulkan…"}
        </span>
      </div>
      <Button size="sm" variant={readyToClaim ? "goldSoft" : "secondary"} disabled={disabled || !readyToClaim} onClick={onClaim} aria-busy={claiming} aria-label={readyToClaim ? "Klaim koin hasil balapan" : `Belum bisa diklaim. ${rewardStatus}`}>
        {claiming ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Coins data-icon="inline-start" />}
        {claiming ? "Mengklaim…" : "Klaim"}
      </Button>
    </section>
  );
}

/**
 * Jalan pintas bonus iklan di tab Balapan; memakai kerangka visual yang sama
 * dengan `RaceReward` supaya kedua kartu hadiah terbaca sebagai satu keluarga.
 * Kreditnya tetap diputuskan server lewat aksi `watch-ad`.
 */
export function AdRewardShortcut({ ad, onWatch, disabled = false, playing = false }: { ad: AdReward; onWatch: () => void; disabled?: boolean; playing?: boolean }) {
  const quota = `${ad.watchedToday}/${ad.dailyCap} hari ini`;
  const status = ad.available ? quota : "Jatah hari ini habis";

  return (
    <section className={cn("race-reward", ad.available && "reward-ready")} aria-label="Bonus iklan">
      <div className="reward-copy">
        <h2 className="reward-heading">Bonus iklan</h2>
        <strong>+{formatCoins(ad.reward)} <span>koin</span></strong>
        <span className="reward-status" title={status}>{ad.available ? quota : "Kuota habis"}</span>
      </div>
      <Button size="sm" variant={ad.available ? "goldSoft" : "secondary"} disabled={disabled || !ad.available} onClick={onWatch} aria-busy={playing} aria-label={ad.available ? `Tonton iklan untuk ${coins(ad.reward)}` : `Jatah iklan habis. ${quota}`}>
        {playing ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Clapperboard data-icon="inline-start" />}
        {playing ? "Memutar…" : "Tonton"}
      </Button>
    </section>
  );
}
