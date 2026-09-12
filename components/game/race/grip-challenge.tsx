'use client'

import { Gauge } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { gripTuning, type DrivingState } from '@/lib/race-dynamics'

export function GripChallenge({ state, tires, onToggle }: { state: DrivingState; tires: number; onToggle: () => void }) {
  const tuning = gripTuning(tires)
  const recovering = state.recovery > 0
  const danger = state.grip < 40 && !recovering
  const status = !state.enabled ? 'Autopilot aman' : recovering ? state.offRoad ? 'Off-road · grip rendah' : 'Kembali ke racing line' : state.shield > 0 ? 'Grip terlindungi' : danger ? 'Grip rendah' : state.corner ? 'Tikungan' : 'Lurus · grip pulih'
  return <div className="grip-challenge" data-danger={danger || recovering}>
    <div className="grip-heading">
      <span><Gauge aria-hidden="true" /> GRIP MOBIL</span>
      <Button variant="ghost" size="xs" aria-pressed={state.enabled} aria-label="Aktifkan simulasi grip" onClick={onToggle}>{state.enabled ? 'Aktif' : 'Nonaktif'}</Button>
    </div>
    {state.enabled && <>
    <div className="grip-controls">
      <div className="grip-telemetry">
        <div className="grip-reading"><span role="status">{status}</span><strong>{Math.ceil(state.grip)}%</strong></div>
        <div className="grip-meter" role="meter" aria-label="Grip mobil" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.ceil(state.grip)}><i style={{ transform: `scaleX(${state.grip / 100})` }} /></div>
      </div>
    </div>
    <div className="grip-footer"><span><strong>{state.cleanCorners}×</strong> tikungan bersih</span><span>{state.courseOuts} course out</span></div>
    </>}
    <div className="grip-footer"><span>Grip ban <strong>Lv. {tuning.level}/10</strong></span><span>Pengurasan <strong>−{tuning.drainReductionPercent}%</strong></span></div>
    <p className="grip-help">Pulih {tuning.straightRecovery} poin/detik di lintasan lurus. {tuning.level < 10 ? 'Upgrade Ban & roller di bengkel untuk grip lebih kuat.' : 'Grip maksimal; boost di tikungan tetap berisiko selip.'} {state.enabled ? '' : 'Aktifkan simulasi untuk merasakan efek grip.'} Simulasi tidak memengaruhi koin &amp; lap server.</p>
  </div>
}
