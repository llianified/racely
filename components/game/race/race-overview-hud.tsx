import { displaySpeedKmh, formatCoins } from "@/lib/game";

export function RaceOverviewHud({ seconds, reward, position, followCamera, recovering }: {
  seconds: number;
  reward: number;
  position: number;
  followCamera: boolean;
  recovering: boolean;
}) {
  return (
    <div className="race-overview-hud font-sans" aria-label="HUD Overview">
      <div className="race-hud-top">
        <div className="race-hud-position" aria-label={`Posisi ${position} dari 3`}>
          <span>Pos</span><strong>{position}</strong><span>/ 3</span>
        </div>
        <span className="race-hud-mode" role="status">
          {recovering ? "Keluar lintasan" : followCamera ? "Follow" : "Overview"}
        </span>
      </div>
      <dl className="race-hud-telemetry">
        <div className="race-hud-speed">
          <dt>Kecepatan</dt>
          <dd>{displaySpeedKmh(seconds).toFixed(1)}<small>km/j</small></dd>
        </div>
        <div>
          <dt>Waktu/lap</dt>
          <dd>{seconds.toFixed(2)}<small>d</small></dd>
        </div>
        <div>
          <dt>Koin/lap</dt>
          <dd className="race-hud-reward">{formatCoins(reward)}</dd>
        </div>
      </dl>
    </div>
  );
}
