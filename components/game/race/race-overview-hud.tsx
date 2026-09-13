import { displaySpeedKmh, formatCoins, formatSpeedKmh } from "@/lib/game";
import { powertrainTuning, type DrivingState } from "@/lib/race-dynamics";

export function RacePositionHud({ position, followCamera, recovering }: {
  position: number;
  followCamera: boolean;
  recovering: boolean;
}) {
  return (
    <div className="race-hud-top font-sans">
      <div className="race-hud-position" aria-label={`Posisi ${position} dari 3`}>
        <span>Pos</span><strong>{position}</strong><span>/ 3</span>
      </div>
      <span className="race-hud-mode" role="status">
        {recovering ? "Keluar lintasan" : followCamera ? "Follow" : "Overview"}
      </span>
    </div>
  );
}

export function RaceOverviewHud({ seconds, baseSeconds, reward, progress, telemetry, boosted, batteryLevel }: {
  seconds: number;
  baseSeconds: number;
  reward: number;
  progress: number;
  telemetry: DrivingState;
  boosted: boolean;
  batteryLevel: number;
}) {
  const lapPercent = Math.min(100, Math.max(0, Math.round(progress * 100)));
  const lapSeconds = seconds.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const recovering = telemetry.recovery > 0;
  const tuning = powertrainTuning(1, batteryLevel);
  const rpm = Math.round(telemetry.rpm / 100) * 100;
  const energy = Math.round(telemetry.boostEnergy * 100);
  const reserveSeconds = telemetry.boostEnergy * tuning.boostCapacitySeconds;
  const energyStatus = !boosted
    ? energy === 100 ? "Penuh" : "Mengisi"
    : telemetry.boostExhausted ? "Habis" : recovering || telemetry.offRoad ? "Tertahan" : "Mendorong";
  const energyDescription = `${energyStatus}, ${energy} persen, cadangan ${reserveSeconds.toFixed(1)} detik dorongan`;
  return (
    <section className="race-overview-hud font-sans" aria-label="Telemetri balapan">
      <div className="race-hud-main">
        <p className="race-hud-speed" aria-label="Kecepatan">
          <strong>{formatSpeedKmh(recovering ? 0 : displaySpeedKmh(baseSeconds) * telemetry.visualSpeed)}</strong>
          <span className="race-hud-speed-unit">km/j</span>
        </p>
        <dl className="race-hud-gauges">
          <div>
            <dt>RPM</dt>
            <dd>{rpm.toLocaleString("id-ID")}</dd>
            <dd className="race-hud-meter" role="meter" aria-label="RPM motor" aria-valuemin={0} aria-valuemax={tuning.maxRpm} aria-valuenow={rpm}>
              <span style={{ transform: `scaleX(${telemetry.rpm / tuning.maxRpm})` }} />
            </dd>
          </div>
          <div title={energyDescription}>
            <dt>Boost</dt>
            <dd>{energy}<small>%</small></dd>
            <dd className="race-hud-meter" role="meter" aria-label="Energi boost" aria-valuemin={0} aria-valuemax={100} aria-valuenow={energy} aria-valuetext={energyDescription}>
              <span style={{ transform: `scaleX(${telemetry.boostEnergy})` }} />
            </dd>
          </div>
        </dl>
      </div>
      <p className="race-hud-lap">
        <span>Lap <strong>{lapPercent}%</strong></span>
        <span><strong>{lapSeconds}</strong> dtk/lap</span>
        <span className="race-hud-reward"><strong>+{formatCoins(reward)}</strong> koin/lap</span>
      </p>
    </section>
  );
}
