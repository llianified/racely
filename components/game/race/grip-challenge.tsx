'use client'

import { ShieldCheck, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DrivingState } from '@/lib/race-dynamics'

export function GripChallenge({ state, active, onStabilize, onToggle }: { state: DrivingState; active: boolean; onStabilize: () => void; onToggle: () => void }) {
  const recovering = state.recovery > 0
  const danger = state.grip < 40 && !recovering
  const status = !state.enabled ? 'Autopilot aman' : recovering ? 'Course out · recovery' : state.shield > 0 ? 'Grip terlindungi' : danger ? 'Grip kritis · stabilkan!' : state.corner ? 'Tikungan · jaga grip' : 'Lurus · grip pulih'
  return <div className="grip-challenge" data-danger={danger || recovering}>
    <div className="grip-heading">
      <span><ShieldCheck size={14} aria-hidden="true" /> TANTANGAN GRIP</span>
      <Button variant="ghost" size="xs" aria-pressed={state.enabled} onClick={onToggle}>{state.enabled ? 'Aktif' : 'Nonaktif'}</Button>
    </div>
    <div className="grip-controls">
      <div className="grip-telemetry">
        <div className="grip-reading"><span role="status">{status}</span><strong>{Math.ceil(state.grip)}%</strong></div>
        <div className="grip-meter" role="meter" aria-label="Grip mobil" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.ceil(state.grip)}><i style={{ transform: `scaleX(${state.grip / 100})` }} /></div>
      </div>
      <Button variant={danger ? 'gold' : 'outline'} size="sm" disabled={!active || !state.enabled || recovering || state.cooldown > 0} onClick={onStabilize} aria-label="Stabilkan mobil, pulihkan grip dan lindungi selama 1,4 detik">
        {danger ? <TriangleAlert data-icon="inline-start" /> : <ShieldCheck data-icon="inline-start" />}
        {recovering ? 'Recovery…' : state.cooldown > 0 ? `${state.cooldown.toFixed(1)}s` : 'Stabilkan'}
      </Button>
    </div>
    <div className="grip-footer"><span><strong>{state.cleanCorners}×</strong> tikungan bersih</span><span>{state.courseOuts} course out</span></div>
    <p className="grip-help">Boost menguras grip di tikungan. Stabilkan sebelum habis. Tantangan sesi saja; koin &amp; lap tetap aman.</p>
  </div>
}
