'use client'

import { Crosshair, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { perfectLineAvailable, type DrivingState } from '@/lib/race-dynamics'

export function GripChallenge({ state, active, onStabilize, onToggle }: { state: DrivingState; active: boolean; onStabilize: () => void; onToggle: () => void }) {
  const recovering = state.recovery > 0
  const danger = state.grip < 40 && !recovering
  const apex = perfectLineAvailable(state) && state.cooldown === 0
  const status = !state.enabled ? 'Autopilot aman' : recovering ? state.offRoad ? 'Off-road · grip rendah' : 'Kembali ke racing line' : state.perfectBoost > 0 ? 'Perfect exit · akselerasi +22%' : state.lineLocked ? 'Line terkunci · tahan sampai exit' : apex ? 'Apex terbuka · kunci sekarang' : state.shield > 0 ? 'Grip terlindungi' : danger ? 'Grip kritis · stabilkan!' : state.corner ? 'Tikungan · jaga grip' : 'Lurus · siapkan apex'
  return <div className="grip-challenge" data-danger={danger || recovering} data-perfect={apex || state.lineLocked || state.perfectBoost > 0}>
    <div className="grip-heading">
      <span><Crosshair aria-hidden="true" /> PERFECT LINE <strong>{state.perfectCorners}×</strong></span>
      <Button variant="ghost" size="xs" aria-pressed={state.enabled} aria-label="Aktifkan tantangan perfect line" onClick={onToggle}>{state.enabled ? 'Aktif' : 'Nonaktif'}</Button>
    </div>
    <div className="grip-controls">
      <div className="grip-telemetry">
        <div className="grip-reading"><span role="status">{status}</span><strong>{Math.ceil(state.grip)}%</strong></div>
        <div className="grip-meter" role="meter" aria-label="Grip mobil" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.ceil(state.grip)}><i style={{ transform: `scaleX(${state.grip / 100})` }} /></div>
      </div>
      <Button variant={danger || apex ? 'gold' : 'outline'} size="sm" disabled={!active || !state.enabled || recovering || state.offRoad || state.cooldown > 0} onClick={onStabilize} aria-label={apex ? 'Kunci apex untuk akselerasi saat keluar tikungan' : 'Stabilkan mobil, pulihkan grip dan lindungi selama 1,4 detik'}>
        {apex ? <Crosshair data-icon="inline-start" /> : danger ? <TriangleAlert data-icon="inline-start" /> : <ShieldCheck data-icon="inline-start" />}
        {recovering ? 'Recovery…' : state.cooldown > 0 ? `${state.cooldown.toFixed(1)}s` : apex ? 'Kunci apex' : 'Stabilkan'}
      </Button>
    </div>
    <div className="grip-footer"><span><strong>{state.cleanCorners}×</strong> tikungan bersih</span><span>{state.courseOuts} course out</span></div>
    <p className="grip-help">Kunci apex saat indikator hijau → akselerasi keluar tikungan. Boost berisiko selip. Tantangan sesi; koin &amp; lap server tidak berubah.</p>
  </div>
}
