"use client";

import { Flag, Zap } from "lucide-react";
import { batteryTelemetry, formatCoins, lapReward, type GameState } from "@/lib/game";
import { clubStandings, type ClubRace } from "@/lib/club-race";
import { raceTrack } from "@/lib/race-tracks";
import type { DrivingState } from "@/lib/race-dynamics";

export function RaceHud({ game, driving, race }: { game: GameState; driving: DrivingState; race: ClubRace }) {
  const practice = race.status !== "idle";
  const battery = batteryTelemetry(game);
  const speed = race.status === "countdown" || race.status === "finished" ? 0 : driving.speedKmh;
  const gear = Math.min(6, Math.max(1, Math.floor(speed / 22) + 1));
  const rpm = speed < 1 ? 900 : Math.min(8500, 2800 + (speed - (gear - 1) * 22) / 22 * 5200);
  const redline = rpm > 7200;
  const status = !driving.enabled ? "AUTOPILOT" : driving.offRoad ? "OFF-ROAD" : driving.recovery > 0 ? "RECOVERY" : driving.perfectBoost > 0 ? "PERFECT EXIT" : driving.grip < 40 ? "GRIP RENDAH" : driving.corner ? driving.lineAssist ? "APEX ASSIST" : "CORNER" : "FULL THROTTLE";
  const rank = clubStandings(race).findIndex(racer => racer.id === 0) + 1;
  const track = raceTrack(race.track);
  return <>
    <div className="scene-overlay race-timing-hud">
      <div className="race-timing-main"><span>{practice ? "POSISI" : "LAP SERVER"}</span><strong>{practice ? `P${rank}` : String(game.laps + 1).padStart(3, "0")}<small>{practice ? "/ 3" : ""}</small></strong></div>
      <div className="race-timing-secondary">{practice ? <><Flag aria-hidden="true" /> LAP {Math.min(track.laps, Math.floor(race.racers[0].distance) + 1)} / {track.laps}</> : <>+{formatCoins(lapReward(game))} KOIN / LAP</>}</div>
      <span className="race-condition" data-danger={driving.recovery > 0 || driving.grip < 40} data-perfect={driving.perfectBoost > 0}>{status}</span>
    </div>
    <div className="scene-overlay instrument-cluster" data-redline={redline} data-boost={game.boostLeft > 0} aria-label="Instrumen balapan virtual">
      <div className="instrument-rpm-label"><span>MOTOR / RPM</span><strong>{(rpm / 1000).toFixed(1)}<small> ×1k</small></strong></div>
      <div className="instrument-rpm" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <i key={i} data-lit={rpm / 9000 * 16 >= i + 1} data-red={i >= 13} />)}</div>
      <div className="instrument-speed">
        <div className="instrument-gear"><span>V-GEAR</span><strong key={gear}>{speed < 1 ? "N" : gear}</strong></div>
        <div><strong>{speed.toFixed(0).padStart(2, "0")}</strong><span>{practice ? "SIM" : "EST."} KM/J</span></div>
      </div>
      <div className="instrument-reserve"><span><Zap aria-hidden="true" />{game.boostLeft > 0 ? "BOOST 2×" : battery.canBoost ? "BOOST READY" : "RECHARGE"}</span><strong>{battery.percent}%</strong></div>
      <div className="instrument-boost-meter" aria-hidden="true"><i style={{ transform: `scaleX(${battery.charge})` }} /></div>
      <div className="instrument-grip"><span>GRIP</span><strong data-danger={driving.grip < 40}>{Math.ceil(driving.grip)}%</strong><span>{redline ? "SHIFT ↑" : driving.perfectBoost > 0 ? "EXIT +16%" : "MINI 4WD"}</span></div>
    </div>
    {race.status === "countdown" && <div className="race-countdown" role="status"><span>CLUB RUN · SIAP?</span><strong key={Math.ceil(race.countdown)}>{Math.max(1, Math.ceil(race.countdown))}</strong><small>{track.laps} LAP / 3 RACERS</small></div>}
  </>;
}
