'use client'

import { memo, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { createRaceTrack } from '@/lib/race-track'
import { LANE_COUNT, LANE_WIDTH } from '@/lib/tamiya-route'

type Track = ReturnType<typeof createRaceTrack>

function laneGeometry(track: Track, lane: number, edge?: number) {
  const segments = Math.ceil(track.totalLength * 32)
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const color = new THREE.Color()
  const halfWidth = edge === undefined ? LANE_WIDTH / 2 - .015 : .017
  const bottom = edge === undefined ? -.025 : -.10
  const crossSection = [[-halfWidth, bottom], [-halfWidth, 0], [halfWidth, 0], [halfWidth, bottom]]
  for (let i = 0; i <= segments; i++) {
    const progress = i / segments
    const p = track.route.point(progress, lane)
    const normalX = Math.cos(p.angle), normalZ = -Math.sin(p.angle)
    const highlight = p.feature !== null && Math.floor(progress * track.totalLength * 3) % 5 === 0
    color.set(edge === undefined ? highlight ? '#b29cde' : lane === 1 ? '#514274' : '#30294c' : p.feature === 'lane-changer' ? '#ffce00' : '#a398c7')
    for (const [lateral, y] of crossSection) {
      const offset = (edge ?? 0) + lateral
      positions.push(p.x + normalX * offset, .125 + p.height + y + (edge === undefined ? 0 : .10), p.z + normalZ * offset)
      colors.push(color.r, color.g, color.b)
    }
    if (i === 0) continue
    for (let side = 0; side < 4; side++) {
      const a = (i - 1) * 4 + side, b = (i - 1) * 4 + (side + 1) % 4
      const c = i * 4 + side, d = i * 4 + (side + 1) % 4
      indices.push(a, c, b, b, c, d)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

export const TamiyaLanes = memo(function TamiyaLanes({ track }: { track: Track }) {
  const geometries = useMemo(() => Array.from({ length: LANE_COUNT }, (_, lane) => [
    laneGeometry(track, lane),
    laneGeometry(track, lane, -LANE_WIDTH / 2),
    laneGeometry(track, lane, LANE_WIDTH / 2),
  ]).flat(), [track])
  useEffect(() => () => geometries.forEach(geometry => geometry.dispose()), [geometries])
  return <group>
    {geometries.map((geometry, index) => <mesh key={index} geometry={geometry} receiveShadow castShadow>
      <meshStandardMaterial vertexColors roughness={.66} metalness={.2} side={THREE.DoubleSide} />
    </mesh>)}
  </group>
})
