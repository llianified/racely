import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { CAR_MODEL_IDS } from '../lib/car-catalog'
import { addBodywork, addStockWing, facetedHull, type AddCarPart, type Finish } from '../components/game/scene/car-bodywork'

function collect(build: (add: AddCarPart) => void) {
  const parts: { finish: Finish; geometry: THREE.BufferGeometry }[] = []
  build((finish, geometry, position = [0, 0, 0], rotation = [0, 0, 0]) => {
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation)))
    geometry.translate(...position)
    parts.push({ finish, geometry })
  })
  return parts
}

function bounds(parts: ReturnType<typeof collect>) {
  const box = new THREE.Box3()
  for (const { geometry } of parts) {
    geometry.computeBoundingBox()
    box.union(geometry.boundingBox!)
  }
  return box
}

describe('Mini 4WD bodywork', () => {
  for (const model of CAR_MODEL_IDS) {
    it(`${model} has finite, nondegenerate geometry with a distinct removable shell and wing`, () => {
      const body = collect(add => addBodywork(model, add))
      const wing = collect(add => addStockWing(model, add))
      try {
        for (const finish of ['body', 'panel', 'glass', 'livery']) {
          expect(body.some(part => part.finish === finish)).toBe(true)
        }
        expect(wing.length).toBeGreaterThan(0)
        const box = bounds([...body, ...wing])
        expect(box.min.y).toBeGreaterThan(.08)
        expect(box.max.y).toBeLessThan(.36)
        expect(box.min.z).toBeGreaterThan(-.4)
        expect(box.max.z).toBeLessThan(.4)
        expect(box.min.x).toBeCloseTo(-box.max.x)
        expect(box.max.x).toBeLessThan(.25)
        for (const { geometry } of [...body, ...wing]) {
          const positions = geometry.getAttribute('position')
          const normals = geometry.getAttribute('normal')
          expect(positions.count).toBeGreaterThan(2)
          expect(Array.from(positions.array).every(Number.isFinite)).toBe(true)
          for (let i = 0; i < normals.count; i++) {
            const length = new THREE.Vector3().fromBufferAttribute(normals, i).length()
            expect(length).toBeCloseTo(1, 4)
          }
        }
      } finally {
        for (const { geometry } of [...body, ...wing]) geometry.dispose()
      }
    })
  }

  it('keeps the Falcon open-wheel and the GT body wider', () => {
    const falcon = collect(add => addBodywork('neo-falcon', add))
    const luna = collect(add => addBodywork('luna-gt', add))
    try {
      const width = (parts: typeof falcon) => bounds(parts.filter(part => part.finish === 'body')).getSize(new THREE.Vector3()).x
      expect(width(luna)).toBeGreaterThan(.35)
      expect(falcon.length).not.toBe(luna.length)
      const canopy = (parts: typeof falcon) => bounds(parts.filter(part => part.finish === 'glass')).getSize(new THREE.Vector3()).x
      expect(canopy(luna)).toBeGreaterThan(canopy(falcon) * 1.4)
    } finally {
      for (const { geometry } of [...falcon, ...luna]) geometry.dispose()
    }
  })

  it('winds the hull outward and preserves hard edges', () => {
    const hull = facetedHull([[-1, 1, 0, 1, 2], [1, 1, 0, 1, 2]])
    try {
      const positions = hull.getAttribute('position')
      const normals = hull.getAttribute('normal')
      for (let i = 0; i < positions.count; i++) {
        const point = new THREE.Vector3().fromBufferAttribute(positions, i).sub(new THREE.Vector3(0, 1, 0))
        const normal = new THREE.Vector3().fromBufferAttribute(normals, i)
        expect(point.dot(normal)).toBeGreaterThan(0)
      }
      expect(hull.index).toBeNull()
    } finally {
      hull.dispose()
    }
  })
})
