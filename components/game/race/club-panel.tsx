"use client";

import { ArrowRight, Check, Crown, Flag, LockKeyhole, Trophy, RotateCcw, Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { clubStandings, raceTime, type ClubRace } from "@/lib/club-race";
import { nextRaceTrack, RACE_TRACKS, raceTrack, trackPoint } from "@/lib/race-tracks";
import type { GameState } from "@/lib/game";
import type { DrivingState } from "@/lib/race-dynamics";

const outlines = RACE_TRACKS.map(track => Array.from({ length: 97 }, (_, i) => {
  const p = trackPoint(i / 96, 2.24, track.id);
  return `${p.x},${p.z}`;
}).join(" "));

export function ClubPanel({ game, race, driving, selected, onSelect, onStart, onExit, disabled }: {
  game: GameState; race: ClubRace; driving: DrivingState; selected: number;
  onSelect: (id: number) => void; onStart: () => void; onExit: () => void; disabled: boolean;
}) {
  const track = raceTrack(selected);
  const next = nextRaceTrack(game.laps);
  const running = race.status === "countdown" || race.status === "racing";
  const started = race.status !== "idle";
  const finished = race.status === "finished";
  const standings = clubStandings(race);
  const position = standings.findIndex(racer => racer.id === 0) + 1;
  const name = (id: number) => id === 0 ? game.player.name : id === 1 ? "Volt" : "Ghost";
  const points = [300, 150, 75][position - 1] + driving.perfectCorners * 100;
  return <section className="panel club-panel" aria-label="Club Run dan leaderboard arena">
    <header className="club-header"><div><span className="eyebrow">RACELY RACING CLUB</span><h2>{finished ? "Finish. Nice run." : started ? "Live standings" : "Satu run lagi?"}</h2></div><Badge variant="outline">VS CPU</Badge></header>
    {!started && <p className="club-intro">Ambil racing line, jaga grip, rebut podium. {track.laps} putaran untuk membuktikannya.</p>}
    {finished && <div className="club-result" role="status">
      <Trophy aria-hidden="true" /><div><span>{position === 1 ? "PODIUM TERATAS" : "RUN SELESAI"}</span><strong>P{position}<small> / 3</small></strong></div><div className="club-result-score"><strong>+{points}</strong><span>POIN SESI · BUKAN KOIN</span></div>
    </div>}
    {started && <>
      <ol className="club-podium" aria-label="Peringkat arena saat ini">
        {standings.map((racer, index) => <li key={racer.id} className="club-podium-place" data-rank={index + 1} data-player={racer.id === 0} style={{ order: index === 0 ? 2 : index === 1 ? 1 : 3 }}>
          {index === 0 && <Crown className="podium-crown" aria-label="Pemimpin" />}
          <div className="podium-avatar" data-driver={racer.id}>{racer.id === 0 ? game.player.name.slice(0, 1).toUpperCase() : racer.id === 1 ? "V" : "G"}<span>{index + 1}</span></div>
          <strong title={name(racer.id)}>{name(racer.id)}</strong><small>{racer.id === 0 ? "KAMU" : "CPU"}</small>
          <div className="podium-plinth"><strong>{racer.finishedAt !== null ? raceTime(racer.finishedAt) : `${Math.min(track.laps, Math.floor(racer.distance) + 1)} / ${track.laps}`}</strong><span>{racer.finishedAt !== null ? "FINISH TIME" : "LAP"}</span></div>
        </li>)}
      </ol>
      <div className="club-player-row"><span className="club-player-rank">P{position}</span><div><strong>Posisimu</strong><span>{driving.perfectCorners} perfect · {driving.courseOuts} keluar lintasan</span></div><div className="club-best"><span>BEST LAP</span><strong>{raceTime(race.racers[0].bestLap)}</strong></div></div>
    </>}
    <div className="club-track-heading"><Route aria-hidden="true" /><strong>{track.name}</strong><span>{track.kind} · {track.laps} lap</span></div>
    {!running && <details className="club-track-picker"><summary>Pilih layout latihan <ArrowRight aria-hidden="true" /></summary><div className="club-track-grid">
      {RACE_TRACKS.map(item => {
        const unlocked = game.laps >= item.unlock;
        return <button key={item.id} className="club-track-option" aria-pressed={selected === item.id} disabled={!unlocked || disabled} onClick={() => onSelect(item.id)} aria-label={`${item.name}, ${unlocked ? `${item.kind}, ${item.laps} lap` : `terbuka setelah ${item.unlock} lap server`}`}>
          <div className="club-track-map"><svg viewBox="-9 -5 18 10" fill="none" aria-hidden="true"><polyline points={outlines[item.id]} vectorEffect="non-scaling-stroke" /></svg><span>{String(item.id + 1).padStart(2, "0")}</span>{!unlocked ? <LockKeyhole aria-hidden="true" /> : selected === item.id ? <Check aria-hidden="true" /> : null}</div>
          <strong>{item.name}</strong><small>{unlocked ? `${item.kind} · ${item.laps} lap` : `${Math.max(0, item.unlock - game.laps)} lap lagi`}</small>
        </button>;
      })}
    </div><p>{track.description}</p></details>}
    {finished && <p className="club-next">{next ? `${Math.max(0, next.unlock - game.laps)} lap server lagi → ${next.name}` : "Semua layout terbuka. Kejar perfect run tanpa course out."}</p>}
    <div className="club-actions"><Button variant="gold" className="flex-1" disabled={disabled || running || game.laps < track.unlock} onClick={onStart}>{finished ? <RotateCcw data-icon="inline-start" /> : <Flag data-icon="inline-start" />}{finished ? "Race lagi" : running ? "Run berlangsung" : "Mulai Club Run"}</Button>{started && <Button variant="outline" disabled={disabled} onClick={onExit}>{running ? "Akhiri" : "Selesai"}</Button>}</div>
    <p className="club-disclaimer">Latihan sesi vs CPU, bukan leaderboard global. Poin tidak disimpan. Koin &amp; progres tetap mengikuti balapan otomatis.</p>
  </section>;
}
