'use client'

import { gripTuning, type DrivingState } from '@/lib/race-dynamics'
import { RaceSwitch, SettingRow } from './setting-row'

/**
 * `ceiling` datang dari `economy.maxUpgradeLevel`, bukan dari batas internal
 * gripTuning: skala grip arena memang berhenti di 10, tapi level yang BISA
 * dicapai pemain adalah yang disetel di panel admin. Menulis "/10" saat
 * ceiling-nya 5 menjanjikan dua level yang tidak akan pernah ada.
 */
export function GripChallenge({ state, tires, ceiling, onToggle }: { state: DrivingState; tires: number; ceiling: number; onToggle: () => void }) {
  const tuning = gripTuning(tires)
  const recovering = state.recovery > 0
  const danger = state.grip < 40 && !recovering
  const status = recovering
    ? state.offRoad ? 'Off-road · grip rendah' : 'Kembali ke racing line'
    : state.shield > 0 ? 'Grip terlindungi'
    : danger ? 'Grip rendah'
    : state.corner ? 'Tikungan · grip turun'
    : 'Lurus · grip pulih'
  return <div className="grip-challenge" data-danger={state.enabled && (danger || recovering)}>
    <SettingRow label="Grip mobil" hint={state.enabled ? status : 'Grip turun di tikungan, pulih di lurus'}>
      <RaceSwitch checked={state.enabled} onChange={onToggle} label="Simulasi grip mobil" />
    </SettingRow>
    {state.enabled && <div className="grip-detail">
      <div className="grip-meter" role="meter" aria-label="Grip mobil" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.ceil(state.grip)}><i style={{ transform: `scaleX(${state.grip / 100})` }} /></div>
      <dl className="grip-stats">
        <div><dt>Grip</dt><dd>{Math.ceil(state.grip)}%</dd></div>
        <div><dt>Tikungan bersih</dt><dd>{state.cleanCorners}×</dd></div>
        <div><dt>Course out</dt><dd>{state.courseOuts}×</dd></div>
        <div><dt>Grip ban</dt><dd>Lv. {tuning.level}/{ceiling}</dd></div>
      </dl>
      <small className="grip-tip">Pulih {tuning.straightRecovery} poin/detik · pengurasan −{tuning.drainReductionPercent}%. {tuning.level < ceiling ? 'Upgrade Ban di bengkel untuk grip lebih kuat.' : 'Grip sudah maksimal.'}</small>
    </div>}
  </div>
}
