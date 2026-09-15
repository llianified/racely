import { describe, expect, it } from 'vitest'
import { BoxGeometry, Group, Mesh } from 'three'
import { measurePreview, previewFitZoom } from '../components/game/scene/car-preview-framing'
import { clampPreviewZoom, MIN_PREVIEW_ZOOM, MAX_PREVIEW_ZOOM } from '../components/game/car/preview-zoom-controls'

function car() {
  const group = new Group()
  const body = new Mesh(new BoxGeometry(.55, .2, .9))
  body.position.y = .15
  group.add(body)
  group.rotation.y = -.35
  return group
}

describe('car preview framing and zoom', () => {
  it('reserves enough room for the car footprint at every orbit angle', () => {
    const bounds = measurePreview(car())
    expect(bounds.safeWidth).toBeGreaterThanOrEqual(bounds.width)
    expect(bounds.safeHeight).toBeGreaterThanOrEqual(bounds.height)
    expect(bounds.safeHeight).toBeGreaterThan(bounds.height)
  })

  it('fits orbit-safe bounds in narrow and wide viewports', () => {
    const bounds = measurePreview(car())
    for (const [width, height] of [[280, 156], [360, 176], [480, 256], [196, 240]]) {
      const zoom = previewFitZoom(width, height, bounds)
      expect(bounds.safeWidth * zoom).toBeLessThan(width)
      expect(bounds.safeHeight * zoom).toBeLessThan(height)
    }
  })

  it('includes an oversized rear wing and keeps measurement translation invariant', () => {
    const group = car()
    const before = measurePreview(group)
    const wing = new Mesh(new BoxGeometry(1.3, .1, .3))
    wing.position.set(0, .5, .5)
    group.add(wing)
    const after = measurePreview(group)
    expect(after.width).toBeGreaterThan(before.width)
    expect(previewFitZoom(360, 148, after)).toBeLessThan(previewFitZoom(360, 148, before))
    group.position.set(3, 2, -4)
    const translated = measurePreview(group)
    expect(translated.width).toBeCloseTo(after.width)
    expect(translated.height).toBeCloseTo(after.height)
  })

  it('returns a usable fit before geometry is available', () => {
    expect(measurePreview(new Group()).width).toBe(1.6)
    expect(previewFitZoom(0, 0, { width: 1.6, height: 1.6 })).toBe(1)
  })

  it('clamps button and gesture input to the same zoom limits', () => {
    expect(clampPreviewZoom(-10)).toBe(MIN_PREVIEW_ZOOM)
    expect(clampPreviewZoom(100)).toBe(MAX_PREVIEW_ZOOM)
    expect(clampPreviewZoom(1.25)).toBe(1.25)
    expect(clampPreviewZoom(NaN)).toBe(1)
    expect(clampPreviewZoom(Infinity)).toBe(1)
  })
})
