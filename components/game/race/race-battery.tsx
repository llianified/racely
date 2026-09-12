"use client";

import { batteryTelemetry, type GameState } from "@/lib/game";

export function RaceBattery({ game, inspect, onInspect }: { game: GameState; inspect: boolean; onInspect: () => void }) {
  const battery = batteryTelemetry(game);
  const status = battery.phase === "discharging" ? "Boost 2× aktif" : battery.phase === "charging" ? `Siap dalam ${battery.readyIn} detik` : "Siap untuk Gaspol";
  return (
    <section className="race-battery" data-phase={battery.phase} aria-label="Baterai cadangan boost">
      <button
        type="button"
        className="battery-shell"
        onClick={onInspect}
        aria-pressed={inspect}
        aria-label={`${battery.percent} persen. ${status}. ${inspect ? "Tutup inspeksi sasis" : "Lihat baterai dan sasis mobil"}`}
        title={inspect ? "Tutup inspeksi sasis" : "Lihat baterai dan sasis mobil"}
      >
        <span className="battery-power">
          <strong className="battery-value" aria-hidden="true">{battery.percent}<small>%</small></strong>
          <span className="battery-meter" role="progressbar" aria-label="Daya baterai boost" aria-valuemin={0} aria-valuemax={100} aria-valuenow={battery.percent} aria-valuetext={`${battery.percent} persen. ${status}`}>
            {Array.from({ length: 10 }, (_, index) => (
              <span className="battery-cell" key={index} aria-hidden="true">
                <span style={{ transform: `scaleX(${Math.max(0, Math.min(1, battery.charge * 10 - index))})` }} />
              </span>
            ))}
          </span>
        </span>
      </button>
    </section>
  );
}
