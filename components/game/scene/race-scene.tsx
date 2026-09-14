'use client'

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from 'react'
import { Flag, RotateCcw } from 'lucide-react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import { CarLighting } from './car-lighting'
import * as THREE from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { COLORS, MiniCar } from './mini-car'
import type { CarModelId } from '@/lib/car-catalog'
import type { GameState } from '@/lib/game'
import { PLAYER_RADIUS, TRACK_HALF, RECOVERY_SECONDS, courseOutPose, resetGripChallenge, stepDriving, stepPowertrain, type DrivingState } from '@/lib/race-dynamics'
import { setupPerformance, type CarSetup } from '@/lib/car-setup'
import { createSetupFeedback, stepSetupFeedback } from './setup-feedback'
import { RacingEffects } from './racing-effects'
import { ContextMonitor, SceneBoundary } from './scene-recovery'

const HALF = TRACK_HALF
export type SceneProps = { setup?: CarSetup; equipped?: NonNullable<GameState['bodyParts']>['equipped']; driving?: RefObject<DrivingState>; onTelemetry?: (state: DrivingState) => void; cinematic?: boolean; levels?: GameState['levels']; model?: CarModelId; progress: number; seconds: number; baseSeconds: number; opponentSeconds: readonly [number, number]; color: string; boosted: boolean; cameraMode: number; followCamera?: boolean; resetKey: number; circuit: number; active?: boolean; reducedMotion?: boolean; inspect?: boolean; charge?: number; bodyVisible?: boolean }

// The 10Hz game tick changes these every 100ms. They are consumed inside useFrame,
// so they travel through a ref instead of props: a tick must not reconcile the 3D tree.
type RaceTiming = Pick<SceneProps, 'progress' | 'seconds' | 'baseSeconds' | 'opponentSeconds' | 'boosted'>

function trackPoint(t: number, radius: number) {
  const straight = HALF * 2
  const arc = Math.PI * radius
  let d = (((t % 1) + 1) % 1) * (straight * 2 + arc * 2)
  if (d < straight) return { x: -HALF + d, z: -radius, angle: Math.PI / 2 }
  d -= straight
  if (d < arc) { const a = d / radius; return { x: HALF + radius * Math.sin(a), z: -radius * Math.cos(a), angle: Math.PI / 2 - a } }
  d -= arc
  if (d < straight) return { x: HALF - d, z: radius, angle: -Math.PI / 2 }
  d -= straight
  const a = d / radius
  return { x: -HALF - radius * Math.sin(a), z: radius * Math.cos(a), angle: -Math.PI / 2 - a }
}

function Ribbon({ inner, outer, height = .12, color, y = 0, glow = false }: { inner: number; outer: number; height?: number; color: string; y?: number; glow?: boolean }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape()
    const hole = new THREE.Path()
    for (let i = 0; i <= 200; i++) {
      const p = trackPoint(i / 200, outer)
      if (i === 0) shape.moveTo(p.x, -p.z); else shape.lineTo(p.x, -p.z)
      const h = trackPoint(1 - i / 200, inner)
      if (i === 0) hole.moveTo(h.x, -h.z); else hole.lineTo(h.x, -h.z)
    }
    shape.closePath(); hole.closePath(); shape.holes.push(hole)
    const extruded = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .018, bevelThickness: .018, curveSegments: 48 })
    // ExtrudeGeometry is non-indexed; welding only exact duplicates keeps every hard edge.
    const indexed = mergeVertices(extruded, 1e-6)
    extruded.dispose()
    indexed.computeBoundingSphere()
    return indexed
  }, [inner, outer, height])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} receiveShadow castShadow>
    <meshStandardMaterial color={color} roughness={.72} metalness={.14} emissive={glow ? color : '#000000'} emissiveIntensity={glow ? .75 : 0} toneMapped={!glow} />
  </mesh>
}

const Racer = memo(function Racer({ lane, color, model, timing, playerRef, levels, driving, onTelemetry, reducedMotion, equipped, setup, circuit }: { levels?: GameState['levels']; model?: CarModelId; lane: number; color: string; timing: RefObject<RaceTiming>; playerRef?: RefObject<THREE.Group | null> } & Pick<SceneProps, 'driving' | 'onTelemetry' | 'reducedMotion' | 'equipped' | 'setup' | 'circuit'>) {
  const ownRef = useRef<THREE.Group>(null)
  const group = playerRef ?? ownRef
  const phase = useRef(lane * .32)
  const seeded = useRef(lane !== 0)
  const publishAfter = useRef(0)
  const tumble = useRef<THREE.Group>(null)
  const wheelSpeed = useRef(0)
  const chassisPitch = useRef(0)
  const energyLamp = useRef<THREE.MeshStandardMaterial>(null)
  const crash = useRef({ active: false, x: 0, y: .14, z: 0, heading: 0, impacts: 0 })
  const feedback = useRef(createSetupFeedback())
  const gear = setup?.gear
  const roller = setup?.roller
  const tires = levels?.tires ?? 1
  const performance = useMemo(() => gear && roller ? setupPerformance({ gear, roller }, tires, circuit) : undefined, [gear, roller, tires, circuit])
  const powertrainVisual = useMemo(() => performance ? { cornerMultiplier: performance.cornerSpeed / performance.speed, accelerationMultiplier: performance.accel } : undefined, [performance])
  useLayoutEffect(() => {
    feedback.current = createSetupFeedback()
    if (performance && driving?.current) resetGripChallenge(driving.current, driving.current.enabled)
    crash.current.active = false
  }, [performance, driving])
  useFrame((_, delta) => {
    if (!group.current || document.hidden) return
    const dt = Math.min(delta, .1)
    const { progress, baseSeconds, boosted } = timing.current
    const seconds = lane === 0 ? timing.current.seconds : (timing.current.opponentSeconds[lane - 1] ?? timing.current.seconds)
    if (!seeded.current) { phase.current = progress; seeded.current = true }
    const state = lane === 0 ? driving?.current : undefined
    if (state) {
      if (performance) stepSetupFeedback(state, feedback.current, dt, phase.current, performance)
      else stepDriving(state, dt, phase.current, boosted && state.boostEnergy > 0 && !state.boostExhausted, levels?.tires)
      stepPowertrain(state, dt, boosted, levels?.engine, levels?.battery, powertrainVisual)
    }
    const recovering = !!state && state.recovery > 0
    const lapsPerSecond = state ? state.visualSpeed / baseSeconds : 1 / seconds
    if (!recovering) phase.current = (phase.current + dt * lapsPerSecond) % 1
    wheelSpeed.current = recovering ? 0 : (HALF * 4 + Math.PI * 2 * (PLAYER_RADIUS + lane * .68)) / .85 * lapsPerSecond
    if (lane === 0 && !recovering) {
      // Transient acceleration is visual; reconcile gradually to paid server laps.
      // Bound correction so recovery never looks like an instant extra boost.
      const drift = ((progress - phase.current + 1.5) % 1) - .5
      const correction = THREE.MathUtils.clamp(drift * (1 - Math.exp(-2 * dt)), -dt / seconds * .15, dt / seconds * .15)
      phase.current = (phase.current + correction + 1) % 1
    }
    const p = trackPoint(phase.current, PLAYER_RADIUS + lane * .68)
    const offset = state?.offset ?? 0
    const slip = state ? Math.max(0, (65 - state.grip) / 65) : 0
    const load = state?.corner && performance ? Math.min(1, performance.cornerLoad / performance.grip) * Math.sin(Math.PI * state.cornerProgress) : 0
    const yaw = state ? THREE.MathUtils.clamp(state.lateralVelocity * .09 + (state.corner ? slip * .16 : 0), -.24, .24) : 0
    const roll = reducedMotion ? 0 : state?.corner ? -(load * .025 + slip * .12) : 0
    const ground = state?.offRoad ? -.08 : .14
    const targetX = p.x + Math.cos(p.angle) * offset
    const targetZ = p.z - Math.sin(p.angle) * offset
    if (recovering && !crash.current.active) {
      Object.assign(crash.current, { active: true, x: group.current.position.x, y: group.current.position.y, z: group.current.position.z, heading: p.angle, impacts: 0 })
    }
    if (recovering && state) {
      const pose = courseOutPose(RECOVERY_SECONDS - state.recovery, reducedMotion)
      const origin = crash.current
      const x = origin.x + Math.cos(origin.heading) * pose.outward + Math.sin(origin.heading) * pose.forward
      const z = origin.z - Math.sin(origin.heading) * pose.outward + Math.cos(origin.heading) * pose.forward
      const clearance = .12 * Math.abs(Math.sin(pose.roll)) + .3 * Math.abs(Math.sin(pose.pitch))
      group.current.position.set(THREE.MathUtils.lerp(x, targetX, pose.rejoin), THREE.MathUtils.lerp(origin.y + pose.groundDrop + pose.lift + clearance, ground, pose.rejoin), THREE.MathUtils.lerp(z, targetZ, pose.rejoin))
      group.current.rotation.set(0, origin.heading + pose.yaw, 0)
      tumble.current?.rotation.set(pose.pitch, 0, -pose.roll)
      group.current.userData.grounded = pose.lift < .04
      group.current.userData.visualOffRoad = pose.rejoin < .65
      if (pose.impacts > origin.impacts) {
        group.current.userData.crashImpact = (group.current.userData.crashImpact ?? 0) + pose.impacts - origin.impacts
        origin.impacts = pose.impacts
      }
    } else {
      crash.current.active = false
      group.current.position.set(targetX, THREE.MathUtils.lerp(group.current.position.y, ground, 1 - Math.exp(-14 * dt)), targetZ)
      group.current.rotation.set(0, p.angle + yaw, 0)
      const targetPitch = reducedMotion ? 0 : THREE.MathUtils.clamp(-(state?.acceleration ?? 0) * .035, -.065, .045)
      chassisPitch.current = THREE.MathUtils.lerp(chassisPitch.current, targetPitch, 1 - Math.exp(-10 * dt))
      tumble.current?.rotation.set(chassisPitch.current, 0, roll)
      group.current.userData.grounded = true
      group.current.userData.visualOffRoad = state?.offRoad ?? false
    }
    group.current.userData.trackHeading = p.angle
    group.current.userData.phase = phase.current
    group.current.userData.speed = state?.visualSpeed ?? 1
    group.current.userData.boostPower = state?.boostPower ?? 0
    if (energyLamp.current && state) energyLamp.current.emissiveIntensity = state.boostEnergy * (1 + state.boostPower * 2)
    if (state) {
      publishAfter.current += dt
      if (publishAfter.current >= .1) { onTelemetry?.({ ...state }); publishAfter.current = 0 }
    }
  }, -2)
  return <group ref={group}>
    <group ref={tumble} position={[0, .17, 0]}>
      <group position={[0, -.17, 0]}>
        <MiniCar roller={roller} color={color} model={model} levels={levels} equipped={equipped} scale={.85} speedRef={wheelSpeed} />
        {lane === 0 && <mesh position={[0, .255, -.30]}>
          <boxGeometry args={[.14, .018, .025]} />
          <meshStandardMaterial ref={energyLamp} color={COLORS.navy} emissive={COLORS.gold} emissiveIntensity={1} toneMapped={false} />
        </mesh>}
      </group>
    </group>
  </group>
})

function TrackBrand() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, 1024, 256)
    ctx.fillStyle = '#b2a5d9'; ctx.globalAlpha = .65; ctx.textAlign = 'center'
    ctx.font = '900 116px Arial'; ctx.letterSpacing = '6px'; ctx.fillText('RACELY', 512, 145)
    ctx.font = '22px Arial'; ctx.fillText('M I N I   4 W D   /   R A C I N G   C L U B', 512, 205)
    ctx.fillStyle = '#ffce00'; ctx.fillRect(345, 235, 334, 3)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }, [])
  useEffect(() => () => texture.dispose(), [texture])
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .023, 0]}><planeGeometry args={[5.6, 1.4]} /><meshBasicMaterial map={texture} transparent depthWrite={false} /></mesh>
}

const TrackMarkings = memo(function TrackMarkings() {
  const curbs = useRef<THREE.InstancedMesh>(null)
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512; canvas.height = 768
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#e3ddf4'
    ctx.font = '800 80px Arial'; ctx.textAlign = 'center'
    for (let lane = 0; lane < 3; lane++) {
      const y = lane * 256
      ctx.globalAlpha = .75
      ctx.fillText(`0${lane + 1}`, 250, y + 158)
      ctx.fillRect(100, y + 28, 310, 6)
      ctx.fillRect(100, y + 28, 6, 46)
      ctx.fillRect(404, y + 28, 6, 46)
    }
    const result = new THREE.CanvasTexture(canvas)
    result.colorSpace = THREE.SRGBColorSpace
    return result
  }, [])
  useEffect(() => () => texture.dispose(), [texture])
  useLayoutEffect(() => {
    if (!curbs.current) return
    const transform = new THREE.Object3D()
    const color = new THREE.Color()
    for (let i = 0; i < 128; i++) {
      const p = trackPoint((i % 64) / 64, i < 64 ? 4.035 : 1.765)
      transform.position.set(p.x, .035, p.z)
      transform.rotation.y = p.angle
      transform.updateMatrix()
      curbs.current.setMatrixAt(i, transform.matrix)
      curbs.current.setColorAt(i, color.set(i % 2 ? '#463e7a' : '#b2a5d9'))
    }
    curbs.current.instanceMatrix.needsUpdate = true
    if (curbs.current.instanceColor) curbs.current.instanceColor.needsUpdate = true
    curbs.current.computeBoundingSphere()
  }, [])
  return <>
    <instancedMesh ref={curbs} args={[undefined, undefined, 128]} receiveShadow>
      <boxGeometry args={[.16, .045, .32]} />
      <meshStandardMaterial roughness={.85} />
    </instancedMesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-2.55, .132, -2.92]}>
      <planeGeometry args={[1.2, 2.04]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-1} />
    </mesh>
  </>
})

const Circuit = memo(function Circuit({ circuit }: { circuit: number }) {
  return <group>
    <Ribbon inner={1.7} outer={4.1} height={.12} y={-.14} color="#090c1d" />
    <Ribbon inner={1.85} outer={3.96} height={.10} color="#2c2852" />
    {[0, 1, 2].map(i => <Ribbon key={i} inner={1.9 + i * .68} outer={2.57 + i * .68} height={.11} color={i === 1 ? '#463e7a' : '#2c2852'} />)}
    <Ribbon inner={4.12} outer={5.25} height={.015} y={-.14} color="#393044" />
    {[1.88, 2.56, 3.24, 3.92].map((r, i) => <Ribbon key={r} inner={r} outer={r + .035} height={.012} y={.115} color={i === 0 || i === 3 ? '#5027a7' : '#9789cd'} />)}
    {[1.88, 3.92].map(r => <Ribbon key={r} inner={r} outer={r + .045} height={.008} y={.13} glow color={circuit ? COLORS.gold : '#a37ef2'} />)}
    <TrackBrand />
    <TrackMarkings />

    <group position={[-1.55, 0, -2.95]}>
      {[-1.12, 1.12].map(z => <mesh key={z} position={[0, .85, z]} castShadow><boxGeometry args={[.16, 1.7, .16]} /><meshStandardMaterial color={COLORS.blue} /></mesh>)}
      <mesh position={[0, 1.75, 0]} castShadow><boxGeometry args={[.22, .32, 2.48]} /><meshStandardMaterial color={COLORS.navy} /></mesh>
      {Array.from({ length: 12 }, (_, i) => <mesh key={i} position={[.12, 1.75, -1.1 + i * .2]}><boxGeometry args={[.025, .24, .16]} /><meshStandardMaterial color={i % 2 === 0 ? COLORS.white : COLORS.blue} /></mesh>)}
      {Array.from({ length: 22 }, (_, i) => <mesh key={i} position={[(i % 2) * .15 - .08, .128, -1 + Math.floor(i / 2) * .19]}><boxGeometry args={[.15, .012, .19]} /><meshStandardMaterial color={(Math.floor(i / 2) + i % 2) % 2 === 0 ? COLORS.navy : COLORS.white} /></mesh>)}
    </group>
    {[-5, -3, -1, 1, 3, 5].map((x, i) => <group key={x} position={[x, 0, 5.5]}>
      <mesh position={[0, .19, 0]} castShadow><boxGeometry args={[1.65, .38, .13]} /><meshStandardMaterial color={i % 2 ? COLORS.white : COLORS.blue} /></mesh>
      {[-.65, .65].map(dx => <mesh key={dx} position={[dx, .045, 0]}><boxGeometry args={[.16, .09, .4]} /><meshStandardMaterial color={COLORS.navy} /></mesh>)}
    </group>)}
    {[-2.7, 2.7].map(x => <group key={x} position={[x, 0, 0]}>
      <mesh position={[0, .16, 0]} castShadow><boxGeometry args={[.58, .32, 1.25]} /><meshStandardMaterial color={COLORS.navy} /></mesh>
      <mesh position={[0, .35, 0]}><boxGeometry args={[.64, .06, 1.32]} /><meshStandardMaterial color={COLORS.blue} /></mesh>
    </group>)}
  </group>
})

function RacingLine({ playerRef, driving }: { playerRef: RefObject<THREE.Group | null>; driving?: RefObject<DrivingState> }) {
  const line = useRef<THREE.InstancedMesh>(null)
  const transform = useMemo(() => new THREE.Object3D(), [])
  useFrame(() => {
    if (!line.current || !playerRef.current) return
    const state = driving?.current
    line.current.visible = !!state?.enabled && !state.recovery
    if (!line.current.visible) return
    const material = line.current.material as THREE.MeshBasicMaterial
    material.color.set(state && state.grip < 40 ? COLORS.gold : COLORS.sky)
    for (let i = 0; i < 32; i++) {
      const progress = (playerRef.current.userData.phase ?? 0) + .018 + i * .004
      const p = trackPoint(progress, PLAYER_RADIUS)
      const offset = (state?.offset ?? 0) * (1 - i / 32)
      transform.position.set(p.x + Math.cos(p.angle) * offset, .142, p.z - Math.sin(p.angle) * offset)
      transform.rotation.set(0, p.angle, 0)
      transform.scale.setScalar(1 - i / 42)
      transform.updateMatrix()
      line.current.setMatrixAt(i, transform.matrix)
    }
    line.current.instanceMatrix.needsUpdate = true
  }, -1)
  return <instancedMesh ref={line} args={[undefined, undefined, 32]} frustumCulled={false}>
    <boxGeometry args={[.075, .008, .065]} /><meshBasicMaterial transparent opacity={.6} depthWrite={false} toneMapped={false} />
  </instancedMesh>
}

function CameraRig({ mode, follow, resetKey, playerRef, active, reducedMotion, cinematic, driving }: { mode: number; follow: boolean; resetKey: number; playerRef: RefObject<THREE.Group | null>; active: boolean; reducedMotion: boolean } & Pick<SceneProps, 'cinematic' | 'driving'>) {
  const { camera, size } = useThree()
  const [overviewCamera] = useState(() => camera)
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const chaseCamera = useRef<THREE.PerspectiveCamera>(null)
  const initialize = useRef(true)
  const manualUntil = useRef(0)
  const bank = useRef(0)
  const cameraDistance = useRef(0)
  const previousOuts = useRef(0)
  const impact = useRef(0)
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const overviewReady = useRef(false)
  const transitioning = useRef(false)
  const overviewTarget = useMemo(() => new THREE.Vector3(), [])
  const overviewZoom = useRef(30)
  const pose = useMemo(() => ({
    position: new THREE.Vector3(),
    rotation: new THREE.Quaternion(),
    heading: new THREE.Quaternion(),
    offset: new THREE.Vector3(),
    target: new THREE.Vector3(),
  }), [])

  useLayoutEffect(() => {
    initialize.current = true
  }, [follow, resetKey, active, size.width, size.height])

  useLayoutEffect(() => {
    if (follow) return
    const [x, y, z] = mode === 1 ? [0, 20, .01] : mode === 2 ? [12, 6.5, 10] : [9, 12.5, 12]
    overviewTarget.set(x, y, z)
    overviewZoom.current = Math.min(size.width / 18.5, size.height / 11.5)
    transitioning.current = overviewReady.current && !reducedMotion
    if (!transitioning.current) {
      overviewCamera.position.copy(overviewTarget)
      overviewCamera.lookAt(0, 0, 0)
      if (overviewCamera instanceof THREE.OrthographicCamera) {
        overviewCamera.zoom = overviewZoom.current
        overviewCamera.updateProjectionMatrix()
      }
    }
    overviewReady.current = true
    controls.current?.target.set(0, 0, 0)
    controls.current?.update()
  }, [overviewCamera, overviewTarget, follow, mode, resetKey, size.width, size.height, reducedMotion])

  // Racer runs at -2; negative priorities preserve Fiber's automatic render.
  useFrame(({ clock }, delta) => {
    if (!active || document.hidden) return
    const dramatic = cinematic && !reducedMotion
    const recovering = (driving?.current.recovery ?? 0) > 0
    const damping = 1 - Math.exp(-9 * Math.min(delta, .1))
    if (controls.current) {
      controls.current.autoRotate = !!dramatic && mode !== 1 && !transitioning.current && performance.now() > manualUntil.current
    }
    if (!follow && transitioning.current) {
      overviewCamera.position.lerp(overviewTarget, damping)
      overviewCamera.lookAt(0, 0, 0)
      if (overviewCamera instanceof THREE.OrthographicCamera) {
        overviewCamera.zoom = THREE.MathUtils.lerp(overviewCamera.zoom, overviewZoom.current, damping)
        overviewCamera.updateProjectionMatrix()
      }
      controls.current?.update()
      if (overviewCamera.position.distanceToSquared(overviewTarget) < .0001) transitioning.current = false
    }
    if (!follow || !playerRef.current || !chaseCamera.current) return
    const speed = playerRef.current.userData.speed ?? 1
    const state = driving?.current
    if (state && state.courseOuts !== previousOuts.current) {
      previousOuts.current = state.courseOuts
      impact.current = dramatic ? .32 : 0
    }
    impact.current = Math.max(0, impact.current - Math.min(delta, .1))
    const nextFov = THREE.MathUtils.lerp(chaseCamera.current.fov, dramatic ? 45 + Math.min(1.5, Math.max(0, speed - .65)) * 7 : 44, damping)
    if (Math.abs(chaseCamera.current.fov - nextFov) > .001) {
      chaseCamera.current.fov = nextFov
      chaseCamera.current.updateProjectionMatrix()
    }
    playerRef.current.getWorldPosition(pose.position)
    pose.rotation.setFromAxisAngle(up, playerRef.current.userData.trackHeading ?? playerRef.current.rotation.y)
    if (initialize.current || delta > .25) {
      pose.heading.copy(pose.rotation)
      initialize.current = false
    } else {
      pose.heading.slerp(pose.rotation, 1 - Math.exp(-(dramatic ? 9 : 18) * Math.min(delta, .1)))
    }

    // Bounded spring-arm lag keeps the car framed even at boost speed; no continuous shake.
    cameraDistance.current = THREE.MathUtils.lerp(cameraDistance.current, dramatic ? Math.max(0, speed - 1) * .55 + (recovering ? .35 : 0) : 0, 1 - Math.exp(-3 * Math.min(delta, .1)))
    const impulse = dramatic ? Math.sin(clock.elapsedTime * 35) * impact.current * .07 : 0
    pose.offset.set(-.2 + impulse, 2.2 + cameraDistance.current * .18, -2.7 - cameraDistance.current)
    pose.target.set(dramatic && state?.corner ? -.18 : 0, .12, dramatic ? .35 : .25)
    // Keep the top of the frustum aimed at the arena, even at maximum boost FOV.
    const minimumPitch = THREE.MathUtils.degToRad(chaseCamera.current.fov / 2 + 8)
    const targetDistance = Math.hypot(pose.target.x - pose.offset.x, pose.target.z - pose.offset.z)
    pose.offset.y = Math.max(pose.offset.y, pose.target.y + Math.tan(minimumPitch) * targetDistance)
    pose.offset.applyQuaternion(pose.heading)
    pose.target.applyQuaternion(pose.heading).add(pose.position)
    chaseCamera.current.position.copy(pose.position).add(pose.offset)
    chaseCamera.current.lookAt(pose.target)
    bank.current = THREE.MathUtils.lerp(bank.current, dramatic && state?.corner && !recovering ? -.018 : 0, damping)
    chaseCamera.current.rotateZ(bank.current)
  }, -.5)

  return <>
    {follow && <PerspectiveCamera ref={chaseCamera} makeDefault fov={42} near={.05} far={100} />}
    {!follow && <OrbitControls ref={controls} camera={overviewCamera} autoRotateSpeed={.45} onStart={() => { transitioning.current = false; manualUntil.current = Infinity }} onEnd={() => { manualUntil.current = performance.now() + 8000 }} enablePan={false} minZoom={12} maxZoom={95} minPolarAngle={.001} maxPolarAngle={Math.PI / 2.35} enableDamping={!reducedMotion} dampingFactor={.08} />}
  </>
}

function CarInspector({ color, model, charge, reducedMotion, bodyVisible, levels, equipped, setup }: Pick<SceneProps, 'color' | 'model' | 'charge' | 'reducedMotion' | 'bodyVisible' | 'levels' | 'equipped' | 'setup'>) {
  const { size } = useThree()
  return <>
    <OrthographicCamera makeDefault position={[1.1, 1.5, 1.7]} zoom={Math.min(size.width / 1.6, size.height / 1.25)} near={.01} far={50} />
    <OrbitControls makeDefault target={[0, .12, 0]} enablePan={false} minZoom={100} maxZoom={450} minPolarAngle={.1} maxPolarAngle={Math.PI / 2.1} enableDamping={!reducedMotion} />
    <MiniCar roller={setup?.roller} equipped={equipped} color={color} model={model} inspect={!bodyVisible} charge={charge} levels={levels} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.008, 0]} receiveShadow>
      <circleGeometry args={[1.4, 64]} /><meshStandardMaterial color={COLORS.surface} roughness={.8} />
    </mesh>
  </>
}

/** Penahan tata letak selama arena dilepas; lihat `standby` di SceneStage. */
function SceneStandby() {
  return <div className="scene-loading absolute inset-0" role="status"><Flag /><strong>Arena dijeda.</strong><span>Buka tab Balapan untuk menyalakannya lagi.</span></div>
}

function SceneError({ onRetry }: { onRetry: () => void }) {
  return <div className="scene-loading absolute inset-0" role="alert"><Flag /><strong>Arena 3D perlu dinyalakan ulang.</strong><span>Progres sesi tetap aman. Coba lagi atau buka di browser yang mendukung WebGL.</span><button onClick={onRetry} className="flex items-center gap-sm"><RotateCcw className="size-(--icon-sm)" />Muat ulang arena</button></div>
}

type ArenaProps = Omit<SceneProps, keyof RaceTiming | 'followCamera' | 'active'> & { timing: RefObject<RaceTiming>; playerRef: RefObject<THREE.Group | null>; follow: boolean; running: boolean; onLost: () => void }

// Everything inside the Canvas. Memoized so parent re-renders driven by telemetry or the
// game tick bail out here instead of reconciling every mesh in the arena.
const Arena = memo(function Arena(props: ArenaProps) {
  const { playerRef, timing, follow, running } = props
  return <>
    <color attach="background" args={[COLORS.navy]} />
    {!props.inspect && <fog attach="fog" args={[COLORS.navy, 30, 85]} />}
    <CarLighting />
    <ambientLight intensity={.3} />
    <hemisphereLight args={[COLORS.white, COLORS.navy, .65]} />
    <directionalLight position={[2, 10, 7]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={props.inspect ? -1.5 : -10} shadow-camera-right={props.inspect ? 1.5 : 10} shadow-camera-top={props.inspect ? 1.5 : 10} shadow-camera-bottom={props.inspect ? -1.5 : -10} shadow-normalBias={.006} shadow-bias={-.0001} />
    <directionalLight position={[-8, 5, -6]} intensity={.8} color={COLORS.white} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.16, 0]} receiveShadow><planeGeometry args={[240, 240]} /><meshStandardMaterial color="#090c1d" roughness={.85} /></mesh>
    {props.inspect ? <CarInspector setup={props.setup} equipped={props.equipped} levels={props.levels} color={props.color} model={props.model} charge={props.charge} reducedMotion={props.reducedMotion} bodyVisible={props.bodyVisible} /> : <>
    <Grid position={[0, -.145, 0]} args={[36, 36]} infiniteGrid cellSize={1} cellThickness={.35} cellColor="#2c2852" sectionSize={5} sectionThickness={.6} sectionColor="#463e7a" fadeDistance={60} fadeStrength={2} />
    <Circuit circuit={props.circuit} />
    <RacingLine playerRef={playerRef} driving={props.driving} />
    <RacingEffects playerRef={playerRef} driving={props.driving} reducedMotion={props.reducedMotion ?? false} />
    <CameraRig cinematic={props.cinematic} driving={props.driving} mode={props.cameraMode} follow={follow} resetKey={props.resetKey} playerRef={playerRef} active={running} reducedMotion={props.reducedMotion ?? false} />
    </>}
    <group visible={!props.inspect}>
      {[0, 1, 2].map(lane => <Racer key={lane} setup={lane === 0 ? props.setup : undefined} circuit={props.circuit} equipped={lane === 0 ? props.equipped : undefined} lane={lane} driving={lane === 0 ? props.driving : undefined} onTelemetry={props.onTelemetry} reducedMotion={props.reducedMotion} levels={lane === 0 ? props.levels : undefined} model={lane === 0 ? props.model : 'neo-falcon'} playerRef={lane === 0 ? playerRef : undefined} color={lane === 0 ? props.color : lane === 1 ? COLORS.gold : COLORS.white} timing={timing} />)}
    </group>
    <ContextMonitor onLost={props.onLost} />
  </>
})

export default function RaceScene(props: SceneProps) {
  const playerRef = useRef<THREE.Group>(null)
  const follow = props.followCamera !== false
  const [attempt, setAttempt] = useState(0)
  const [lost, setLost] = useState(false)
  const [visible, setVisible] = useState(true)
  const [ready, setReady] = useState(false)
  const timing = useRef<RaceTiming>({ progress: props.progress, seconds: props.seconds, baseSeconds: props.baseSeconds, opponentSeconds: props.opponentSeconds, boosted: props.boosted })
  useLayoutEffect(() => {
    timing.current.progress = props.progress
    timing.current.seconds = props.seconds
    timing.current.baseSeconds = props.baseSeconds
    timing.current.opponentSeconds = props.opponentSeconds
    timing.current.boosted = props.boosted
  }, [props.progress, props.seconds, props.baseSeconds, props.opponentSeconds, props.boosted])
  useEffect(() => {
    const change = () => setVisible(!document.hidden)
    change()
    document.addEventListener('visibilitychange', change)
    return () => document.removeEventListener('visibilitychange', change)
  }, [])
  const onLost = useCallback(() => setLost(true), [])
  const retry = () => { setReady(false); setLost(false); setAttempt(v => v + 1) }
  /**
   * Arena DILEPAS saat tab lain yang aktif, bukan sekadar dijeda.
   * `frameloop: 'never'` menghentikan rendering tapi tidak melepaskan WebGL
   * context-nya, dan tab Garasi membangun context keduanya sendiri. Dua context
   * hidup bersamaan cukup untuk membunuh renderer WebView di perangkat kelas
   * bawah: halaman kosong "This page couldn't load", bukan context loss yang
   * bisa ditangkap ContextMonitor.
   *
   * Yang ditukar: kembali ke Balapan membangun ulang arena, jadi jeda
   * "Menyalakan lampu sirkuit" muncul lagi. `document.hidden` sengaja TIDAK
   * ikut melepas -- itu akan membongkar arena setiap kali notifikasi lewat.
   */
  const standby = props.active === false
  useEffect(() => {
    // Mount berikutnya membangun context baru, jadi penanda kesiapannya ikut
    // mundur; tanpa ini arena berikutnya tampil kosong tanpa kabar apa pun.
    if (!standby) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(false)
  }, [standby])
  if (lost) return <SceneError onRetry={retry} />
  if (standby) return <SceneStandby />
  const running = visible
  return <SceneBoundary key={attempt} fallback={<SceneError onRetry={retry} />}>
    {!ready && <div className="scene-loading absolute inset-0" role="status"><Flag /><strong>Menyalakan lampu sirkuit.</strong><span>Menyiapkan lintasan 3D…</span></div>}
    <Canvas orthographic dpr={[1, 1.25]} frameloop={running ? 'always' : 'never'} shadows="percentage" camera={{ position: [9, 12.5, 12], zoom: 30, near: .1, far: 100 }} gl={{ antialias: true, alpha: false, powerPreference: 'default' }} fallback={<SceneError onRetry={retry} />} onCreated={() => setReady(true)} aria-label={props.inspect ? 'Inspeksi sasis dan dua sel baterai mobil. Geser untuk memutar, cubit untuk zoom. Balapan tetap berlangsung.' : follow ? 'Arena mini 4WD 3D. Kamera mengikuti mobilmu. Pilih Overview untuk melihat seluruh lintasan.' : 'Arena mini 4WD 3D. Kamera overview. Geser untuk memutar, cubit untuk zoom.'}>
      <Arena setup={props.setup} equipped={props.equipped} driving={props.driving} onTelemetry={props.onTelemetry} cinematic={props.cinematic} levels={props.levels} model={props.model} color={props.color} cameraMode={props.cameraMode} resetKey={props.resetKey} circuit={props.circuit} reducedMotion={props.reducedMotion} inspect={props.inspect} charge={props.inspect ? props.charge : undefined} bodyVisible={props.bodyVisible} timing={timing} playerRef={playerRef} follow={follow} running={running} onLost={onLost} />
    </Canvas>
  </SceneBoundary>
}
