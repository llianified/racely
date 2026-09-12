'use client'

import { useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { DrivingState } from '@/lib/race-dynamics'

export function RacingEffects({ playerRef, driving, boosted, reducedMotion }: { playerRef: RefObject<THREE.Group | null>; driving?: RefObject<DrivingState>; boosted: boolean; reducedMotion: boolean }) {
  const trail = useRef<THREE.InstancedMesh>(null)
  const sparks = useRef<THREE.InstancedMesh>(null)
  const marker = useRef<THREE.Mesh>(null)
  const samples = useMemo(() => Array.from({ length: 28 }, () => new THREE.Vector3()), [])
  const transform = useMemo(() => new THREE.Object3D(), [])
  const ready = useRef(false)
  const sampleTime = useRef(0)
  useFrame(({ clock }, delta) => {
    const player = playerRef.current
    if (!player || !trail.current || !sparks.current || !marker.current) return
    const state = driving?.current
    if (!ready.current || delta > .25) { samples.forEach(p => p.copy(player.position)); ready.current = true }
    sampleTime.current += Math.min(delta, .1)
    if (sampleTime.current > .025) {
      for (let i = samples.length - 1; i > 0; i--) samples[i].copy(samples[i - 1])
      samples[0].copy(player.position)
      sampleTime.current = 0
    }
    trail.current.visible = !reducedMotion && !(state && state.recovery > 0)
    for (let i = 0; i < samples.length; i++) {
      transform.position.copy(samples[i]); transform.position.y = .145
      const size = (1 - i / samples.length) * (boosted ? .13 : .06)
      transform.scale.set(size, .009, size); transform.rotation.set(0, 0, 0); transform.updateMatrix()
      trail.current.setMatrixAt(i, transform.matrix)
    }
    trail.current.instanceMatrix.needsUpdate = true
    sparks.current.visible = !reducedMotion && !!state?.enabled && (state.grip < 40 || state.recovery > 0)
    if (sparks.current.visible) {
      for (let i = 0; i < 18; i++) {
        const age = (clock.elapsedTime * 1.8 + i / 18) % 1
        const angle = i * 2.39996
        transform.position.set(player.position.x + Math.cos(angle) * age * .8, Math.max(.14, player.position.y + Math.sin(age * Math.PI) * .4), player.position.z + Math.sin(angle) * age * .8)
        transform.scale.set(.018 * (1 - age), .018 * (1 - age), .1 * (1 - age))
        transform.rotation.set(angle, angle, 0); transform.updateMatrix()
        sparks.current.setMatrixAt(i, transform.matrix)
      }
      sparks.current.instanceMatrix.needsUpdate = true
    }
    marker.current.position.set(player.position.x, .14, player.position.z)
    marker.current.visible = !state?.recovery
    const material = marker.current.material as THREE.MeshBasicMaterial
    material.color.set(state && state.shield > 0 ? '#ffce00' : '#8db5ff')
  }, -1)
  return <>
    <instancedMesh ref={trail} args={[undefined, undefined, 28]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} /><meshBasicMaterial color={boosted ? '#ffce00' : '#4275ff'} transparent opacity={.65} toneMapped={false} depthWrite={false} />
    </instancedMesh>
    <instancedMesh ref={sparks} args={[undefined, undefined, 18]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} /><meshBasicMaterial color="#ffce00" toneMapped={false} />
    </instancedMesh>
    <mesh ref={marker} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[.27, .3, 32]} /><meshBasicMaterial color="#8db5ff" transparent opacity={.6} depthWrite={false} toneMapped={false} />
    </mesh>
  </>
}
