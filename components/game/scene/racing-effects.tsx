'use client'

import { useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { DrivingState } from '@/lib/race-dynamics'
import { COLORS } from './mini-car'

const PARTICLES = 48

export function RacingEffects({ playerRef, driving, reducedMotion }: { playerRef: RefObject<THREE.Group | null>; driving?: RefObject<DrivingState>; reducedMotion: boolean }) {
  const trail = useRef<THREE.InstancedMesh>(null)
  const dust = useRef<THREE.InstancedMesh>(null)
  const streaks = useRef<THREE.InstancedMesh>(null)
  const marker = useRef<THREE.Mesh>(null)
  const samples = useMemo(() => Array.from({ length: 28 }, () => new THREE.Vector3()), [])
  const particles = useMemo(() => Array.from({ length: PARTICLES }, () => ({ position: new THREE.Vector3(), velocity: new THREE.Vector3(), life: 0, gravel: false, spark: false })), [])
  const transform = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])
  const ready = useRef(false)
  const sampleTime = useRef(0)
  const emission = useRef(0)
  const nextParticle = useRef(0)
  const previousImpact = useRef(0)
  useFrame(({ clock }, delta) => {
    const player = playerRef.current
    if (!player || !trail.current || !dust.current || !streaks.current || !marker.current || document.hidden) return
    const state = driving?.current
    const dt = Math.min(delta, .1)
    const heading = player.userData.trackHeading ?? 0
    const speed = player.userData.speed ?? 1
    const offRoad = player.userData.visualOffRoad ?? state?.offRoad ?? false
    const grounded = player.userData.grounded !== false
    const crashImpact = player.userData.crashImpact ?? 0
    if (!ready.current || delta > .25) {
      samples.forEach(p => p.copy(player.position))
      particles.forEach(p => { p.life = 0 })
      ready.current = true
    }
    sampleTime.current += dt
    if (sampleTime.current > .025) {
      for (let i = samples.length - 1; i > 0; i--) samples[i].copy(samples[i - 1])
      samples[0].copy(player.position)
      sampleTime.current = 0
    }
    trail.current.visible = !reducedMotion && speed > 1.15 && !state?.recovery
    if (trail.current.visible) {
      const material = trail.current.material as THREE.MeshBasicMaterial
      material.color.set((state?.boostPower ?? 0) > 0 ? COLORS.gold : COLORS.azure)
      for (let i = 0; i < samples.length; i++) {
        transform.position.copy(samples[i]); transform.position.y = .145
        const size = (1 - i / samples.length) * .085
        transform.scale.set(size, .006, size); transform.rotation.set(0, 0, 0); transform.updateMatrix()
        trail.current.setMatrixAt(i, transform.matrix)
      }
      trail.current.instanceMatrix.needsUpdate = true
    }
    dust.current.visible = !reducedMotion
    if (!reducedMotion) {
      if (crashImpact > previousImpact.current) {
        for (let i = 0; i < 20; i++) {
          const index = nextParticle.current++ % PARTICLES
          const p = particles[index]
          const angle = i * 2.4
          p.life = 1
          p.gravel = true
          p.spark = i % 3 === 0
          p.position.set(player.position.x, -.04, player.position.z)
          p.velocity.set(Math.cos(angle) * (1 + i % 3 * .35), .8 + i % 4 * .18, Math.sin(angle) * (1 + i % 3 * .35))
        }
      }
      const slipping = grounded && !!state?.enabled && (state.grip < 55 || state.recovery > 0)
      emission.current = slipping ? emission.current + dt * (offRoad ? 44 : 22) : 0
      while (emission.current >= 1) {
        emission.current -= 1
        const index = nextParticle.current++ % PARTICLES
        const p = particles[index]
        const side = index % 2 ? 1 : -1
        p.gravel = offRoad
        p.spark = false
        p.life = 1
        p.position.set(player.position.x - Math.sin(heading) * .22 + Math.cos(heading) * side * .16, Math.max(-.08, player.position.y), player.position.z - Math.cos(heading) * .22 - Math.sin(heading) * side * .16)
        p.velocity.set(-Math.sin(heading) * .6 + Math.cos(index * 2.4) * .5, p.gravel ? .55 : .22, -Math.cos(heading) * .6 + Math.sin(index * 2.4) * .5)
      }
      for (let i = 0; i < PARTICLES; i++) {
        const p = particles[i]
        p.life = Math.max(0, p.life - dt * (p.spark ? 2.8 : 1.7))
        if (p.life > 0) {
          p.position.addScaledVector(p.velocity, dt)
          p.velocity.y += (p.gravel ? -3.8 : .12) * dt
          if (p.gravel && p.position.y < -.09) {
            p.position.y = -.09
            p.velocity.y = Math.abs(p.velocity.y) * .25
            p.velocity.x *= .7
            p.velocity.z *= .7
          }
          transform.position.copy(p.position)
          const size = p.spark ? .025 * p.life : p.gravel && i % 3 === 0 ? .035 * p.life : (.045 + (1 - p.life) * .14) * p.life
          transform.scale.set(size, size, p.spark ? size * 3 : size)
          color.set(p.spark ? COLORS.gold : p.gravel ? COLORS.gravel : COLORS.muted).multiplyScalar(p.spark ? 2 : .5 + p.life * .5)
          dust.current.setColorAt(i, color)
        } else transform.scale.setScalar(0)
        transform.rotation.set(i, i * .7, 0)
        transform.updateMatrix()
        dust.current.setMatrixAt(i, transform.matrix)
      }
      dust.current.instanceMatrix.needsUpdate = true
      if (dust.current.instanceColor) dust.current.instanceColor.needsUpdate = true
    } else particles.forEach(p => { p.life = 0 })

    streaks.current.visible = !reducedMotion && speed > 1.65 && !state?.recovery
    if (streaks.current.visible) {
      for (let i = 0; i < 16; i++) {
        const along = 6 - ((clock.elapsedTime * (3 + speed * 3) + i * .71) % 9)
        const side = (i % 2 ? 1 : -1) * (1.25 + (i % 3) * .32)
        transform.position.set(player.position.x + Math.sin(heading) * along + Math.cos(heading) * side, .2 + (i % 4) * .25, player.position.z + Math.cos(heading) * along - Math.sin(heading) * side)
        transform.rotation.set(0, heading, 0)
        transform.scale.set(.008, .008, .18 + speed * .12)
        transform.updateMatrix()
        streaks.current.setMatrixAt(i, transform.matrix)
      }
      streaks.current.instanceMatrix.needsUpdate = true
    }
    previousImpact.current = crashImpact
    marker.current.position.set(player.position.x, offRoad ? -.085 : .142, player.position.z)
    const material = marker.current.material as THREE.MeshBasicMaterial
    material.color.set(state?.recovery || state && state.grip < 40 ? COLORS.gold : COLORS.sky)
  }, -1)
  return <>
    <instancedMesh ref={trail} args={[undefined, undefined, 28]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} /><meshBasicMaterial color={COLORS.azure} transparent opacity={.45} toneMapped={false} depthWrite={false} />
    </instancedMesh>
    <instancedMesh ref={dust} args={[undefined, undefined, PARTICLES]} frustumCulled={false}>
      <icosahedronGeometry args={[1, 0]} /><meshBasicMaterial transparent opacity={.38} depthWrite={false} />
    </instancedMesh>
    <instancedMesh ref={streaks} args={[undefined, undefined, 16]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} /><meshBasicMaterial color={COLORS.sky} transparent opacity={.3} depthWrite={false} toneMapped={false} />
    </instancedMesh>
    <mesh ref={marker} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[.27, .29, 32]} /><meshBasicMaterial color={COLORS.sky} transparent opacity={.55} depthWrite={false} toneMapped={false} />
    </mesh>
  </>
}
