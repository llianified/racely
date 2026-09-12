import { stepDriving, type DrivingState } from "./race-dynamics";
import { raceTrack, trackCorner } from "./race-tracks";

export type ClubRacer = { id: number; distance: number; finishedAt: number | null; bestLap: number | null; lastCrossing: number };
export type ClubRace = {
  status: "idle" | "countdown" | "racing" | "finished";
  track: number;
  countdown: number;
  elapsed: number;
  baseSeconds: number;
  racers: ClubRacer[];
};

export function createClubRace(track = 0, baseSeconds = 8): ClubRace {
  return { status: "idle", track, countdown: 3, elapsed: 0, baseSeconds, racers: [0, 1, 2].map(id => ({ id, distance: 0, finishedAt: null, bestLap: null, lastCrossing: 0 })) };
}

export function clubStandings(race: ClubRace) {
  return [...race.racers].sort((a, b) => {
    if (a.finishedAt !== null && b.finishedAt !== null) return a.finishedAt - b.finishedAt || a.id - b.id;
    if (a.finishedAt !== null) return -1;
    if (b.finishedAt !== null) return 1;
    return b.distance - a.distance || a.id - b.id;
  });
}

// Club runs are local practice against CPU cars, never a source of withdrawable coins.
export function stepClubRace(race: ClubRace, driving: DrivingState, delta: number, boosted: boolean, tires: number) {
  const dt = Math.max(0, Math.min(Number.isFinite(delta) ? delta : 0, .1));
  if (race.status === "idle" || race.status === "finished") return;
  if (race.status === "countdown") {
    race.countdown = Math.max(0, race.countdown - dt);
    if (race.countdown === 0) race.status = "racing";
    return;
  }
  const track = raceTrack(race.track);
  const previousTime = race.elapsed;
  race.elapsed += dt;
  stepDriving(driving, dt, race.racers[0].distance, boosted, tires, race.track);
  for (const racer of race.racers) {
    if (racer.finishedAt !== null) continue;
    const oldDistance = racer.distance;
    const corner = trackCorner(racer.distance, race.track) >= 0;
    const speed = racer.id === 0
      ? (boosted ? 2 : 1) * driving.speedMultiplier
      : (racer.id === 1 ? .98 : .9) * (corner ? .88 : 1.08);
    const advance = dt * speed / (race.baseSeconds * track.duration);
    racer.distance = Math.min(track.laps, oldDistance + advance);
    if (Math.floor(racer.distance) > Math.floor(oldDistance)) {
      const fraction = advance > 0 ? (Math.floor(racer.distance) - oldDistance) / advance : 1;
      const crossing = previousTime + dt * fraction;
      const lap = crossing - racer.lastCrossing;
      racer.bestLap = racer.bestLap === null ? lap : Math.min(racer.bestLap, lap);
      racer.lastCrossing = crossing;
      if (racer.distance >= track.laps) racer.finishedAt = crossing;
    }
  }
  if (race.racers[0].finishedAt !== null) race.status = "finished";
}

export const raceTime = (seconds: number | null) => seconds === null ? "—" : `${seconds.toFixed(2)} d`;
