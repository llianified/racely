'use client'

import { Gauge } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DrivingState } from '@/lib/race-dynamics'

export function GripChallenge({ state, onToggle }: { state: DrivingState; onToggle: () => void }) {
  const recovering = state.recovery > 0
  const danger = state.grip < 40 && !recovering
  const status = !state.enabled ? 'Autopilot aman' : recovering ? state.offRoad ? 'Off-road · grip rendah' : 'Kembali ke racing line' : state.shield > 0 ? 'Grip terlindungi' : danger ? 'Grip rendah' : state.corner ? 'Tikungan' : 'Lurus · grip pulih'
  return <div className="grip-challenge" data-danger={danger || recovering}>
    <div className="grip-heading">
      <span><Gauge aria-hidden="true" /> GRIP MOBIL</span>
      <Button variant="ghost" size="xs" aria-pressed={state.enabled} aria-label="Aktifkan simulasi grip" onClick={onToggle}>{state.enabled ? 'Aktif' : 'Nonaktif'}</Button>
    </div>
    <div className="grip-controls">
      <div className="grip-telemetry">
        <div className="grip-reading"><span role="status">{status}</span><strong>{Math.ceil(state.grip)}%</strong></div>
        <div className="grip-meter" role="meter" aria-label="Grip mobil" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.ceil(state.grip)}><i style={{ transform: `scaleX(${state.grip / 100})` }} /></div>
      </div>
    </div>
    <div className="grip-footer"><span><strong>{state.cleanCorners}×</strong> tikungan bersih</span><span>{state.courseOuts} course out</span></div>
    <p className="grip-help">Grip dan pemulihan berjalan otomatis. Boost berisiko selip; upgrade ban membantu grip. Simulasi sesi; koin &amp; lap server tidak berubah.</p>
  </div>
}
