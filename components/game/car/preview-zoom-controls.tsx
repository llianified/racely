'use client'

import { useCallback, useState } from 'react'
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const MIN_PREVIEW_ZOOM = .5
export const MAX_PREVIEW_ZOOM = 2.5

export function clampPreviewZoom(value: number) {
  return Number.isFinite(value) ? Math.min(MAX_PREVIEW_ZOOM, Math.max(MIN_PREVIEW_ZOOM, value)) : 1
}

export function usePreviewZoom() {
  const [zoom, setZoom] = useState(1)
  const [resetKey, setResetKey] = useState(0)
  const onZoomChange = useCallback((value: number) => setZoom(clampPreviewZoom(value)), [])
  const reset = useCallback(() => { setZoom(1); setResetKey(value => value + 1) }, [])
  return { zoom, resetKey, onZoomChange, reset }
}

export function PreviewZoomControls({ zoom, onZoomChange, reset }: Pick<ReturnType<typeof usePreviewZoom>, 'zoom' | 'onZoomChange' | 'reset'>) {
  return (
    <div className="car-preview-tools">
      <span className="car-preview-hint">Geser putar · cubit zoom</span>
      <div className="car-preview-zoom" role="group" aria-label="Zoom preview mobil">
        <Button type="button" variant="ghost" size="icon-lg" disabled={zoom <= MIN_PREVIEW_ZOOM} onClick={() => onZoomChange(Math.round((zoom - .25) * 100) / 100)} aria-label="Perkecil mobil" title="Perkecil mobil">
          <ZoomOut aria-hidden="true" />
        </Button>
        <Button type="button" variant="ghost" className="car-preview-reset" onClick={reset} aria-label={`Reset zoom dan sudut mobil, zoom saat ini ${Math.round(zoom * 100)} persen`} title="Reset zoom dan sudut mobil">
          <RotateCcw data-icon="inline-start" aria-hidden="true" />
          <span aria-live="polite" aria-atomic="true">{Math.round(zoom * 100)}%</span>
        </Button>
        <Button type="button" variant="ghost" size="icon-lg" disabled={zoom >= MAX_PREVIEW_ZOOM} onClick={() => onZoomChange(Math.round((zoom + .25) * 100) / 100)} aria-label="Perbesar mobil" title="Perbesar mobil">
          <ZoomIn aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
