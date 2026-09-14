import { displaySpeedKmh, formatCoins, formatSpeedKmh } from "@/lib/game";
import { powertrainTuning, type DrivingState } from "@/lib/race-dynamics";

export function RacePositionHud({ position, total, lane, switching, followCamera, recovering, telemetry }: {
  lane: number;
  switching: boolean;
  position: number;
  total: number;
  followCamera: boolean;
  recovering: boolean;
  telemetry?: DrivingState;
}) {
  return (
    <div className="race-hud-top font-sans">
      <div className="race-hud-position" aria-label={`Posisi ${position} dari ${total} berdasarkan progres lap`}>
        <span>Pos arena</span><strong>{position}</strong><span>/ {total}</span>
      </div>
      <span className="race-hud-mode" role="status">
        {switching ? 'Pindah lane' : `Lane ${lane}`} · {recovering ? "Course-out · kembali ke trek" : telemetry ? telemetry.corner ? telemetry.grip < 40 ? "Tikungan · grip lepas" : telemetry.grip < 70 ? "Tikungan · beban tinggi" : "Tikungan · stabil" : telemetry.acceleration > .15 ? "Lurus · akselerasi" : "Lurus · laju puncak" : followCamera ? "Follow" : "Overview"}
      </span>
    </div>
  );
}

export function RaceOverviewHud({ seconds, baseSeconds, reward, progress, telemetry, laps }: {
  seconds: number;
  baseSeconds: number;
  reward: number;
  progress: number;
  telemetry: DrivingState;
  laps: number;
}) {
  const lapPercent = Math.min(100, Math.max(0, Math.round(progress * 100)));
  const lapSeconds = seconds.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const recovering = telemetry.recovery > 0;
  const tuning = powertrainTuning(1, 1);
  const rpm = Math.round(telemetry.rpm / 100) * 100;
  return (
    <section className="race-overview-hud font-sans" aria-label="Telemetri balapan">
      <dl className="race-hud-grid">
        <div className="race-hud-cell race-hud-speed">
          <dt>Kecepatan</dt>
          <dd>
            <strong>{formatSpeedKmh(recovering ? 0 : displaySpeedKmh(baseSeconds) * telemetry.visualSpeed)}</strong>
            <small>km/j</small>
          </dd>
        </div>
        <div className="race-hud-cell">
          <dt>RPM</dt>
          <dd>{rpm.toLocaleString("id-ID")}</dd>
          <dd className="race-hud-meter" role="meter" aria-label="RPM motor" aria-valuemin={0} aria-valuemax={tuning.maxRpm} aria-valuenow={rpm}>
            <span style={{ transform: `scaleX(${telemetry.rpm / tuning.maxRpm})` }} />
          </dd>
        </div>
        <div className="race-hud-cell">
          <dt>Total lap</dt>
          <dd>{laps.toLocaleString('id-ID')}</dd>
        </div>
        <div className="race-hud-cell race-hud-lap">
          <dt>Lap</dt>
          <dd>{lapPercent}<small>%</small></dd>
          <dd
            className="race-hud-ring"
            role="meter"
            aria-label="Progres lap"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={lapPercent}
            style={{ "--ring-fill": `${lapPercent}%` } as React.CSSProperties}
          />
        </div>
        <div className="race-hud-cell">
          <dt>Waktu</dt>
          <dd>{lapSeconds}<small>dtk/lap</small></dd>
        </div>
        <div className="race-hud-cell race-hud-reward">
          <dt>Hadiah</dt>
          <dd>+{formatCoins(reward)}<small>koin/lap</small></dd>
        </div>
      </dl>
    </section>
  );
}
