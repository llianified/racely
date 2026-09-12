"use client";

import { BatteryCharging, BatteryFull, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BATTERY_RECHARGE_SECONDS,
  BOOST_DURATION_SECONDS,
  batteryTelemetry,
  type GameState,
} from "@/lib/game";

export function RaceBattery({ game, inspect, onInspect }: { game: GameState; inspect: boolean; onInspect: () => void }) {
  const battery = batteryTelemetry(game);
  const Icon = battery.phase === "charging" ? BatteryCharging : BatteryFull;
  const status = battery.phase === "discharging" ? "Menyalurkan daya 2×" : battery.phase === "charging" ? `Penuh dalam ${battery.readyIn}d` : "Siap untuk Gaspol";
  return (
    <section className="race-battery" data-phase={battery.phase} aria-label="Baterai cadangan boost">
      <div className="battery-heading">
        <div className="battery-title">
          <Icon size={20} aria-hidden="true" />
          <span className="battery-reading">
            <span className="battery-label">Baterai boost</span>
            <strong className="battery-value">{battery.percent}%</strong>
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={onInspect} aria-pressed={inspect} aria-label={inspect ? "Tutup inspeksi sasis" : "Lihat baterai dan sasis mobil"}>
          <ScanLine data-icon="inline-start" aria-hidden="true" />{inspect ? "Tutup sasis" : "Lihat sasis"}
        </Button>
      </div>
      <div className="battery-meter" role="progressbar" aria-label="Daya baterai boost" aria-valuemin={0} aria-valuemax={100} aria-valuenow={battery.percent} aria-valuetext={`${battery.percent} persen. ${status}`}>
        <div style={{ transform: `scaleX(${battery.charge})` }} />
      </div>
      <div className="battery-caption">
        <span>{status}</span>
        <span>{BOOST_DURATION_SECONDS}d boost · {BATTERY_RECHARGE_SECONDS}d isi</span>
      </div>
    </section>
  );
}
