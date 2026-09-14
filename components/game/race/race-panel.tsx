"use client";

import dynamic from "next/dynamic";
import { useId, useRef, useState, useSyncExternalStore } from "react";
import { Camera, ChevronDown, Coins, Flag, LoaderCircle, Maximize, Minimize, RotateCcw, SlidersHorizontal, SwitchCamera, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { batteryTelemetry, carSetup, coins, formatCoins, lapReward, lapSeconds, raceOpponentLapSeconds, racePosition, type GameState } from "@/lib/game";
import { RaceOverviewHud, RacePositionHud } from "./race-overview-hud";
import { cn } from "@/lib/utils";
import { createDrivingState, isCleanBoostLaunch } from "@/lib/race-dynamics";
import { trackLayoutAt } from "@/lib/track-layout";
import { RaceSwitch, SettingRow } from "./setting-row";
import { NEUTRAL_SETUP } from "@/lib/car-setup";

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
  const opponents = raceOpponentLapSeconds(game);
  const position = racePosition(game);
  const boosted = game.boostLeft > 0;
  // Prediksi yang memakai fungsi dan posisi lintasan yang sama persis dengan
  // penilaian server, supaya tombol tidak pernah menjanjikan durasi penuh untuk
  // tekanan yang akan dipotong. Tombolnya TIDAK dinonaktifkan: menekan di
  // tikungan tetap boleh -- itu pilihannya, lengkap dengan biayanya.
  const cornerLaunch =
    game.economy.boostCornerPenalty > 0 &&
    !isCleanBoostLaunch(
      game.progress,
      game.economy.boostLaunchGraceLap,
      trackLayoutAt(game.circuit),
    );
  const boostLabel = boosting
    ? "Memulai…"
    : boosted
      ? "Gaspol aktif"
      : game.cooldown > 0
        ? "Mengisi ulang"
        : cornerLaunch
          ? "Tunggu lurus"
          : `Gaspol ${game.economy.boostMultiplier}×`;
  const boostLabelForAssistiveTechnology = boosting
    ? "Memulai Gaspol"
    : boosted
      ? `Gaspol aktif, ${Math.ceil(game.boostLeft)} detik tersisa`
      : game.cooldown > 0
        ? `Baterai mengisi ulang, siap dalam ${battery.readyIn} detik`
        : cornerLaunch
          ? "Mobil sedang di tikungan; menekan sekarang memperpendek Gaspol, tunggu trek lurus untuk durasi penuh"
          : `Aktifkan Gaspol, kecepatan ${game.economy.boostMultiplier} kali selama ${game.economy.boostDurationSeconds} detik`;
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
  const unlockLaps = game.economy.circuitUnlockLaps;
  // Hanya saat masih di trek 1: ambangnya bisa dinaikkan operator lewat /admin
  // setelah pemain pindah, dan kail "menuju Midnight" tidak boleh muncul di
  // kepala panel pemain yang sedang balapan di Midnight.
  const lapsToUnlock = game.circuit === 0 ? Math.max(0, unlockLaps - game.laps) : 0;
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
          <Button variant="ghost" size="sm" className="circuit-trigger" onClick={openCircuits} aria-label={`Pilih sirkuit: ${game.circuit ? "Midnight Speedway" : "Jakarta Raceway"}`} aria-haspopup="dialog">
            {game.circuit ? "Midnight Speedway" : "Jakarta Raceway"}
            <ChevronDown data-icon="inline-end" />
          </Button>
        </h2>
        {lapsToUnlock > 0 && (
          <div className="track-unlock">
            <span>{lapsToUnlock} lap lagi → Midnight</span>
            <Progress
              value={Math.min((game.laps / unlockLaps) * 100, 100)}
              aria-label={`Midnight Speedway terbuka setelah ${lapsToUnlock} putaran lagi`}
              className="flex-1"
            />
          </div>
        )}
      </div>
      <div className={cn("scene-wrap", inspect && "is-inspecting", !inspect && cinematic && "is-cinematic", !inspect && telemetry.recovery > 0 && "is-course-out", !inspect && telemetry.grip < 40 && "is-grip-critical")}>
        {!inspect && <div className="race-vignette" aria-hidden="true" />}
        {!inspect && <RacePositionHud telemetry={telemetry} position={position} followCamera={followCamera} recovering={telemetry.recovery > 0} />}
        {inspect && <div className="scene-overlay inspect-hud"><strong>{bodyVisible ? "DETAIL MOBIL" : "DI BALIK BODI"}</strong><span>{bodyVisible ? "Cat metalik · ban · aero kit" : "2 sel · motor · penggerak 4WD"}</span></div>}
        <RaceScene setup={carSetup(game)} equipped={game.bodyParts?.equipped} driving={driving} onTelemetry={setTelemetry} cinematic={cinematic && !reducedMotion} levels={game.levels} model={game.carSelection?.model ?? 'neo-falcon'} progress={game.progress} seconds={seconds} baseSeconds={baseSeconds} opponentSeconds={opponents} color={game.color} boosted={boosted} cameraMode={cameraMode} followCamera={followCamera} resetKey={resetKey} circuit={game.circuit} active={active} reducedMotion={reducedMotion} inspect={inspect} charge={battery.charge} bodyVisible={bodyVisible} />
        {inspect && <div className="scene-overlay inspect-hint">Geser untuk memutar · balapan tetap jalan</div>}
      </div>
      {!inspect && <RaceOverviewHud seconds={seconds} baseSeconds={baseSeconds} reward={lapReward(game)} progress={game.progress} telemetry={telemetry} boosted={boosted} batteryLevel={game.levels.battery} />}
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
          <Button variant="outline" size="icon-sm" onClick={fullscreen} aria-label={isFullscreen ? "Keluar dari layar penuh" : "Buka layar penuh"} title={isFullscreen ? "Keluar layar penuh" : "Layar penuh"}>
            {isFullscreen ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => setSettingsOpen(value => !value)} aria-expanded={settingsOpen} aria-controls={settingsId} aria-label="Pengaturan balapan" title="Pengaturan balapan">
            <SlidersHorizontal aria-hidden="true" />
          </Button>
          {!inspect && <Button className="race-boost-action" variant="gold" size="sm" onClick={onBoost} disabled={disabled || boosting || !battery.canBoost} aria-busy={boosting} aria-label={boostLabelForAssistiveTechnology} title={game.cooldown > 0 ? `Baterai siap dalam ${battery.readyIn} detik` : undefined}>
            {boosting ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Zap data-icon="inline-start" fill="currentColor" />}
            <span>{boostLabel}</span>
            {!boosting && (boosted || game.cooldown > 0) && <small>{Math.ceil(boosted ? game.boostLeft : game.cooldown)}s</small>}
          </Button>}
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
        <header className="reward-heading">
          <h2>Hasil balapan</h2>
          {readyToClaim ? (
            <span className="reward-status">{rewardStatus}</span>
          ) : (
            <Progress className="reward-progress" value={Math.min(pending * 100, 100)} aria-label={rewardStatus} />
          )}
        </header>
        <strong>{coins(pending)}</strong>
      </div>
      <Button size="sm" variant={readyToClaim ? "goldSoft" : "secondary"} disabled={disabled || !readyToClaim} onClick={onClaim} aria-busy={claiming} aria-label={readyToClaim ? "Klaim koin hasil balapan" : `Belum bisa diklaim. ${rewardStatus}`}>
        {claiming ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Coins data-icon="inline-start" />}
        {claiming ? "Mengklaim…" : "Klaim"}
      </Button>
    </section>
  );
}
