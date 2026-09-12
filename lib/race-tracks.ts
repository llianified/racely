export const RACE_TRACKS = [
  { id: 0, name: "Jakarta Sprint", kind: "Sprint", unlock: 0, half: 3.35, chicane: 0, radiusScale: 1, duration: 1, grip: 1, laps: 3, description: "Lurus panjang. Simpan Gaspol untuk keluar tikungan." },
  { id: 1, name: "Midnight Switchback", kind: "Technical", unlock: 25, half: 3.1, chicane: .8, radiusScale: 1, duration: 1.15, grip: 1.15, laps: 3, description: "Dua chicane menguji ritme. Jaga line, lalu melesat." },
  { id: 2, name: "Violet Edge", kind: "Risk", unlock: 75, half: 2.6, chicane: 1.05, radiusScale: 1, duration: 1.1, grip: 1.4, laps: 3, description: "Tikungan rapat, bahu berdebu. Cepat belum tentu menang." },
  { id: 3, name: "Afterhours GT", kind: "Endurance", unlock: 150, half: 4.8, chicane: .45, radiusScale: 1.15, duration: 1.55, grip: 1.1, laps: 5, description: "Lima lap di lintasan panjang. Konsistensi jadi pembeda." },
] as const;

export type RaceTrack = (typeof RACE_TRACKS)[number];
export const raceTrack = (id: number): RaceTrack => RACE_TRACKS.find(track => track.id === id) ?? RACE_TRACKS[0];
export const nextRaceTrack = (laps: number) => RACE_TRACKS.find(track => laps < track.unlock);

export function trackCorner(progress: number, id = 0) {
  const track = raceTrack(id);
  const straight = track.half * 2;
  const arc = Math.PI * 2.24 * track.radiusScale;
  const distance = (((progress % 1) + 1) % 1) * (straight + arc) * 2 % (straight + arc);
  if (distance >= straight) return (distance - straight) / arc;
  const u = distance / straight;
  return track.chicane && u > .18 && u < .82 ? (u - .18) / .64 : -1;
}

export function trackPoint(progress: number, radius: number, id = 0) {
  const track = raceTrack(id);
  const half = track.half;
  const r = radius * track.radiusScale;
  const straight = half * 2;
  const arc = Math.PI * r;
  let d = (((progress % 1) + 1) % 1) * (straight * 2 + arc * 2);
  const wave = (u: number) => track.chicane * Math.sin(u * Math.PI * 2) * Math.sin(u * Math.PI) ** 2;
  const derivative = (u: number) => track.chicane * (2 * Math.PI * Math.cos(u * Math.PI * 2) * Math.sin(u * Math.PI) ** 2 + Math.PI * Math.sin(u * Math.PI * 2) ** 2) / straight;
  if (d < straight) {
    const u = d / straight;
    return { x: -half + d, z: -r + wave(u), angle: Math.atan2(1, derivative(u)) };
  }
  d -= straight;
  if (d < arc) { const a = d / r; return { x: half + r * Math.sin(a), z: -r * Math.cos(a), angle: Math.PI / 2 - a }; }
  d -= arc;
  if (d < straight) {
    const u = d / straight;
    return { x: half - d, z: r - wave(u), angle: Math.atan2(-1, -derivative(u)) };
  }
  d -= straight;
  const a = d / r;
  return { x: -half - r * Math.sin(a), z: r * Math.cos(a), angle: -Math.PI / 2 - a };
}
