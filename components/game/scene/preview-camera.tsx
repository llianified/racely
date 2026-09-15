'use client'

import { useLayoutEffect, useRef, type ComponentRef } from 'react'
import { useThree } from '@react-three/fiber'
import { OrbitControls, OrthographicCamera } from '@react-three/drei'
import type { OrthographicCamera as ThreeCamera } from 'three'
import { clampPreviewZoom, MAX_PREVIEW_ZOOM, MIN_PREVIEW_ZOOM } from '../car/preview-zoom-controls'
import { PREVIEW_POSITION, PREVIEW_TARGET } from './car-preview-framing'

export type PreviewCameraControls = {
  zoom?: number
  resetKey?: number
  onZoomChange?: (zoom: number) => void
}

export function PreviewCamera({ baseZoom, interactive = true, zoom = 1, resetKey = 0, onZoomChange, position = PREVIEW_POSITION, target = PREVIEW_TARGET }: PreviewCameraControls & {
  baseZoom: number
  interactive?: boolean
  position?: [number, number, number]
  target?: [number, number, number]
}) {
  const camera = useRef<ThreeCamera>(null)
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const updating = useRef(false)
  const invalidate = useThree(state => state.invalidate)

  useLayoutEffect(() => {
    if (!camera.current) return
    updating.current = true
    camera.current.zoom = baseZoom * clampPreviewZoom(zoom)
    camera.current.updateProjectionMatrix()
    controls.current?.update()
    updating.current = false
    invalidate()
  }, [baseZoom, zoom, invalidate])

  useLayoutEffect(() => {
    if (!camera.current) return
    updating.current = true
    camera.current.position.set(...position)
    camera.current.lookAt(...target)
    controls.current?.target.set(...target)
    controls.current?.update()
    updating.current = false
    invalidate()
  }, [resetKey, position, target, invalidate])

  return <>
    <OrthographicCamera ref={camera} makeDefault position={position} near={.01} far={50} />
    {interactive && <OrbitControls
      ref={controls}
      makeDefault
      target={target}
      enablePan={false}
      enableZoom
      zoomSpeed={.8}
      minZoom={baseZoom * MIN_PREVIEW_ZOOM}
      maxZoom={baseZoom * MAX_PREVIEW_ZOOM}
      enableDamping={false}
      minPolarAngle={.15}
      maxPolarAngle={Math.PI / 2.1}
      onChange={() => {
        if (updating.current || !camera.current) return
        const next = clampPreviewZoom(camera.current.zoom / baseZoom)
        if (Math.abs(next - zoom) > .0001) onZoomChange?.(next)
      }}
    />}
  </>
}
