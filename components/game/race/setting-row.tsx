'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function SettingRow({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return <div className={cn('race-setting', className)}>
    <div className="race-setting-copy">
      <strong>{label}</strong>
      {hint && <span>{hint}</span>}
    </div>
    {children}
  </div>
}

export function RaceSwitch({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" className="race-switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onChange}>
    <i aria-hidden="true" />
  </button>
}
