import { displaySpeedKmh, formatCoins } from "@/lib/game";
import { powertrainTuning, type DrivingState } from "@/lib/race-dynamics";

export function RaceOverviewHud({ seconds, baseSeconds, reward, position, followCamera, telemetry, boosted, batteryLevel }: {
  seconds: number;
  baseSeconds: number;
  reward: number;
  position: number;
  followCamera: boolean;
  telemetry: DrivingState;
  boosted: boolean;
  batteryLevel: number;
}) {
  const recovering = telemetry.recovery > 0;
  const tuning = powertrainTuning(1, batteryLevel);
  const rpm = Math.round(telemetry.rpm / 100) * 100;
  const energy = Math.round(telemetry.boostEnergy * 100);
  const reserveSeconds = telemetry.boostEnergy * tuning.boostCapacitySeconds;
  const energyStatus = !boosted
    ? energy === 100 ? "Penuh" : "Mengisi"
    : telemetry.boostExhausted ? "Habis" : recovering || telemetry.offRoad ? "Tertahan" : "Mendorong";
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
      <div className="race-hud-bottom">
      <dl className="race-hud-telemetry">
        <div className="race-hud-speed">
          <dt>Laju arena</dt>
          <dd>{(recovering ? 0 : displaySpeedKmh(baseSeconds) * telemetry.visualSpeed).toFixed(1)}<small>km/j</small></dd>
        </div>
        <div>
          <dt>Lap server</dt>
          <dd>{seconds.toFixed(2)}<small>d</small></dd>
        </div>
        <div>
          <dt>Koin/lap</dt>
          <dd className="race-hud-reward">{formatCoins(reward)}</dd>
        </div>
      </dl>
      <div className="race-hud-powertrain">
        <div className="race-hud-gauge">
          <div><span>RPM arena</span><strong>{rpm.toLocaleString("id-ID")}</strong></div>
          <div className="race-hud-meter" role="meter" aria-label="RPM motor arena" aria-valuemin={0} aria-valuemax={tuning.maxRpm} aria-valuenow={rpm}>
            <span style={{ transform: `scaleX(${telemetry.rpm / tuning.maxRpm})` }} />
          </div>
        </div>
        <div className="race-hud-gauge">
          <div><span>Energi arena</span><strong>{energy}%</strong></div>
          <div className="race-hud-meter" role="meter" aria-label="Energi boost arena" aria-valuemin={0} aria-valuemax={100} aria-valuenow={energy} aria-valuetext={`${energyStatus}, ${energy} persen, cadangan ${reserveSeconds.toFixed(1)} detik dorongan arena`}>
            <span style={{ transform: `scaleX(${telemetry.boostEnergy})` }} />
          </div>
          <span className="race-hud-energy-status">{energyStatus} · {reserveSeconds.toFixed(1)} d</span>
        </div>
      </div>
      </div>
    </div>
  );
}
