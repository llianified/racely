"use client";

import { BatteryCharging, BatteryFull, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  batteryTelemetry,
  type GameState,
} from "@/lib/game";

export function RaceBattery({ game, inspect, onInspect }: { game: GameState; inspect: boolean; onInspect: () => void }) {
  const { economy } = game;
  const battery = batteryTelemetry(game);
  const Icon = battery.phase === "charging" ? BatteryCharging : BatteryFull;
  const status = battery.phase === "discharging" ? `Boost ${economy.boostMultiplier}× aktif` : battery.phase === "charging" ? `Siap dalam ${battery.readyIn} detik` : "Siap untuk Gaspol";
  return (
    <section className="race-battery" data-phase={battery.phase} aria-label="Baterai cadangan boost">
      <div className="battery-heading">
        <div className="battery-title">
          <Icon size={20} aria-hidden="true" />
          <span className="battery-reading">
            <span className="battery-label">Baterai boost</span>
            <span className="battery-status">{status}</span>
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={onInspect} aria-pressed={inspect} aria-label={inspect ? "Tutup inspeksi sasis" : "Lihat baterai dan sasis mobil"}>
          <ScanLine data-icon="inline-start" aria-hidden="true" />{inspect ? "Tutup sasis" : "Lihat sasis"}
        </Button>
      </div>
      <div className="battery-power">
        <strong className="battery-value" aria-hidden="true">{battery.percent}<small>%</small></strong>
        <div className="battery-meter" role="progressbar" aria-label="Daya baterai boost" aria-valuemin={0} aria-valuemax={100} aria-valuenow={battery.percent} aria-valuetext={`${battery.percent} persen. ${status}`}>
          {Array.from({ length: 20 }, (_, index) => (
            <span className="battery-cell" key={index} aria-hidden="true">
              <span style={{ transform: `scaleX(${Math.max(0, Math.min(1, battery.charge * 20 - index))})` }} />
            </span>
          ))}
        </div>
      </div>
      <div className="battery-caption">
        <span><strong>{economy.boostMultiplier}×</strong> laju · {economy.boostDurationSeconds} detik</span>
        <span>Isi ulang <strong>{economy.batteryRechargeSeconds} detik</strong></span>
      </div>
    </section>
  );
}
