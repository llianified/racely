import { describe, expect, it } from 'vitest'
import { Box3, BoxGeometry, Group, Mesh, Sphere } from 'three'
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
  it('fills the default view more closely than the old spherical framing', () => {
    const group = car()
    const bounds = measurePreview(group)
    const sphere = new Box3().setFromObject(group).getBoundingSphere(new Sphere())
    const oldZoom = 140 / (sphere.radius * 2 * 1.08)
    const newZoom = previewFitZoom(360, 140 - 44, bounds)
    expect(newZoom).toBeGreaterThan(oldZoom * 1.2)
    expect(bounds.width * newZoom).toBeLessThan(360)
    expect(bounds.height * newZoom).toBeLessThan(96)
  })

  it('fits both narrow and wide viewports without clipping the default view', () => {
    const bounds = measurePreview(car())
    for (const [width, height] of [[280, 96], [360, 148], [480, 196], [96, 240]]) {
      const zoom = previewFitZoom(width, height, bounds)
      expect(bounds.width * zoom).toBeLessThan(width)
      expect(bounds.height * zoom).toBeLessThan(height)
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
