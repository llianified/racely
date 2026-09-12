'use client'

import { Component, memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type ComponentRef, type RefObject } from 'react'
import { Flag, RotateCcw } from 'lucide-react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import { CarLighting } from './car-lighting'
import * as THREE from 'three'
import { COLORS, MiniCar } from './mini-car'
import type { CarModelId } from '@/lib/car-catalog'
import type { GameState } from '@/lib/game'
import { PLAYER_RADIUS, TRACK_HALF, stepDriving, type DrivingState } from '@/lib/race-dynamics'
import { RacingEffects } from './racing-effects'

const HALF = TRACK_HALF
export type SceneProps = { driving?: RefObject<DrivingState>; onTelemetry?: (state: DrivingState) => void; cinematic?: boolean; levels?: GameState['levels']; model?: CarModelId; progress: number; seconds: number; color: string; boosted: boolean; cameraMode: number; followCamera?: boolean; resetKey: number; circuit: number; active?: boolean; reducedMotion?: boolean; inspect?: boolean; charge?: number; bodyVisible?: boolean }

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
  const shape = useMemo(() => {
    const result = new THREE.Shape()
    const hole = new THREE.Path()
    for (let i = 0; i <= 200; i++) {
      const p = trackPoint(i / 200, outer)
      if (i === 0) result.moveTo(p.x, -p.z); else result.lineTo(p.x, -p.z)
      const h = trackPoint(1 - i / 200, inner)
      if (i === 0) hole.moveTo(h.x, -h.z); else hole.lineTo(h.x, -h.z)
    }
    result.closePath(); hole.closePath(); result.holes.push(hole)
    return result
  }, [inner, outer])
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} receiveShadow castShadow>
    <extrudeGeometry args={[shape, { depth: height, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .018, bevelThickness: .018, curveSegments: 48 }]} />
    <meshStandardMaterial color={color} roughness={.72} metalness={.14} emissive={glow ? color : '#000000'} emissiveIntensity={glow ? .75 : 0} toneMapped={!glow} />
  </mesh>
}

function Racer({ lane, color, model, progress, seconds, boosted, playerRef, levels, driving, onTelemetry, reducedMotion }: { levels?: GameState['levels']; model?: CarModelId; lane: number; color: string; progress: number; seconds: number; boosted: boolean; playerRef?: RefObject<THREE.Group | null> } & Pick<SceneProps, 'driving' | 'onTelemetry' | 'reducedMotion'>) {
  const ownRef = useRef<THREE.Group>(null)
  const group = playerRef ?? ownRef
  const phase = useRef(lane === 0 ? progress : lane * .32)
  const publishAfter = useRef(0)
  useFrame((_, delta) => {
    if (!group.current || document.hidden) return
    const dt = Math.min(delta, .1)
    const state = lane === 0 ? driving?.current : undefined
    if (state) stepDriving(state, dt, phase.current, boosted, levels?.tires)
    // Local racing distance must not be pulled back to server progress: that cancels grip penalties.
    phase.current = (phase.current + dt * (state?.speedMultiplier ?? 1) / (seconds * (lane === 0 ? 1 : 1.16 + lane * .08))) % 1
    const p = trackPoint(phase.current, PLAYER_RADIUS + lane * .68)
    const offset = state?.offset ?? 0
    const slip = state ? Math.max(0, (65 - state.grip) / 65) : 0
    const yaw = state ? THREE.MathUtils.clamp(state.lateralVelocity * .09 + (state.corner ? slip * .22 : 0), -.32, .32) : 0
    const roll = reducedMotion ? 0 : state?.corner ? -slip * .06 : 0
    const ground = state?.offRoad ? -.08 : .14
    group.current.position.set(p.x + Math.cos(p.angle) * offset, THREE.MathUtils.lerp(group.current.position.y, ground, 1 - Math.exp(-14 * dt)), p.z - Math.sin(p.angle) * offset)
    group.current.rotation.set(0, p.angle + yaw, roll)
    group.current.userData.trackHeading = p.angle
    group.current.userData.phase = phase.current
    group.current.userData.speed = (boosted ? 2 : 1) * (state?.speedMultiplier ?? 1)
    if (state) {
      publishAfter.current += dt
      if (publishAfter.current >= .1) { onTelemetry?.({ ...state }); publishAfter.current = 0 }
    }
  }, -2)
  return <group ref={group}>
    <MiniCar color={color} model={model} levels={levels} scale={.85} speed={(HALF * 4 + Math.PI * 2 * (2.24 + lane * .68)) / (seconds * (lane === 0 ? 1 : 1.16 + lane * .08)) / .85} />
  </group>
}

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
      transform.position.set(p.x, .142, p.z)
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

function CameraRig({ mode, follow, resetKey, playerRef, active, reducedMotion, cinematic, driving }: { mode: number; follow: boolean; resetKey: number; playerRef: RefObject<THREE.Group | null>; active: boolean; boosted: boolean; reducedMotion: boolean } & Pick<SceneProps, 'cinematic' | 'driving'>) {
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
    pose.offset.set(-.2 + impulse, 2.2 + cameraDistance.current * .18, -2.7 - cameraDistance.current).applyQuaternion(pose.heading)
    pose.target.set(dramatic && state?.corner ? -.18 : 0, .12, dramatic ? 1.25 : .8).applyQuaternion(pose.heading).add(pose.position)
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

function CarInspector({ color, model, charge, reducedMotion, bodyVisible, levels }: Pick<SceneProps, 'color' | 'model' | 'charge' | 'reducedMotion' | 'bodyVisible' | 'levels'>) {
  const { size } = useThree()
  return <>
    <OrthographicCamera makeDefault position={[1.1, 1.5, 1.7]} zoom={Math.min(size.width / 1.6, size.height / 1.25)} near={.01} far={50} />
    <OrbitControls makeDefault target={[0, .12, 0]} enablePan={false} minZoom={100} maxZoom={450} minPolarAngle={.1} maxPolarAngle={Math.PI / 2.1} enableDamping={!reducedMotion} />
    <MiniCar color={color} model={model} inspect={!bodyVisible} charge={charge} levels={levels} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.008, 0]} receiveShadow>
      <circleGeometry args={[1.4, 64]} /><meshStandardMaterial color={COLORS.surface} roughness={.8} />
    </mesh>
  </>
}

function SceneError({ onRetry }: { onRetry: () => void }) {
  return <div className="scene-loading" role="alert"><Flag /><strong>Arena 3D perlu dinyalakan ulang.</strong><span>Progres sesi tetap aman. Coba lagi atau buka di browser yang mendukung WebGL.</span><button onClick={onRetry} className="flex items-center gap-2"><RotateCcw size={14} />Muat ulang arena</button></div>
}

class SceneBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <SceneError onRetry={this.props.onRetry} />
    return this.props.children
  }
}

function ContextMonitor({ onLost }: { onLost: () => void }) {
  const { gl } = useThree()
  useEffect(() => {
    const canvas = gl.domElement
    const lost = (event: Event) => { event.preventDefault(); onLost() }
    canvas.addEventListener('webglcontextlost', lost)
    return () => canvas.removeEventListener('webglcontextlost', lost)
  }, [gl, onLost])
  return null
}

export default function RaceScene(props: SceneProps) {
  const playerRef = useRef<THREE.Group>(null)
  const follow = props.followCamera !== false
  const [attempt, setAttempt] = useState(0)
  const [lost, setLost] = useState(false)
  const [visible, setVisible] = useState(true)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const change = () => setVisible(!document.hidden)
    change()
    document.addEventListener('visibilitychange', change)
    return () => document.removeEventListener('visibilitychange', change)
  }, [])
  const retry = () => { setReady(false); setLost(false); setAttempt(v => v + 1) }
  if (lost) return <SceneError onRetry={retry} />
  return <SceneBoundary key={attempt} onRetry={retry}>
    {!ready && <div className="scene-loading absolute inset-0" role="status"><Flag /><strong>Menyalakan lampu sirkuit.</strong><span>Menyiapkan lintasan 3D…</span></div>}
    <Canvas orthographic dpr={[1, 1.25]} frameloop={visible && props.active !== false ? 'always' : 'never'} shadows="percentage" camera={{ position: [9, 12.5, 12], zoom: 30, near: .1, far: 100 }} gl={{ antialias: true, alpha: false, powerPreference: 'default' }} fallback={<SceneError onRetry={retry} />} onCreated={() => setReady(true)} aria-label={props.inspect ? 'Inspeksi sasis dan dua sel baterai mobil. Geser untuk memutar, cubit untuk zoom. Balapan tetap berlangsung.' : follow ? 'Arena mini 4WD 3D. Kamera mengikuti mobilmu. Pilih Overview untuk melihat seluruh lintasan.' : 'Arena mini 4WD 3D. Kamera overview. Geser untuk memutar, cubit untuk zoom.'}>
      <color attach="background" args={['#191939']} />
      <CarLighting />
      <ambientLight intensity={.3} />
      <hemisphereLight args={[COLORS.white, COLORS.navy, .65]} />
      <directionalLight position={[2, 10, 7]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={props.inspect ? -1.5 : -10} shadow-camera-right={props.inspect ? 1.5 : 10} shadow-camera-top={props.inspect ? 1.5 : 10} shadow-camera-bottom={props.inspect ? -1.5 : -10} shadow-normalBias={.006} shadow-bias={-.0001} />
      <directionalLight position={[-8, 5, -6]} intensity={.8} color={COLORS.white} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.16, 0]} receiveShadow><planeGeometry args={[80, 80]} /><meshStandardMaterial color="#090c1d" roughness={.85} /></mesh>
      {props.inspect ? <CarInspector levels={props.levels} color={props.color} model={props.model} charge={props.charge} reducedMotion={props.reducedMotion} bodyVisible={props.bodyVisible} /> : <>
      <Grid position={[0, -.145, 0]} args={[36, 36]} cellSize={1} cellThickness={.35} cellColor="#2c2852" sectionSize={5} sectionThickness={.6} sectionColor="#463e7a" fadeDistance={23} fadeStrength={3} />
      <Circuit circuit={props.circuit} />
      {[0, 1, 2].map(lane => <Racer key={lane} lane={lane} driving={lane === 0 ? props.driving : undefined} onTelemetry={props.onTelemetry} reducedMotion={props.reducedMotion} levels={lane === 0 ? props.levels : undefined} model={lane === 0 ? props.model : 'neo-falcon'} playerRef={lane === 0 ? playerRef : undefined} color={lane === 0 ? props.color : lane === 1 ? COLORS.gold : COLORS.white} progress={props.progress} seconds={props.seconds} boosted={props.boosted} />)}
      <RacingLine playerRef={playerRef} driving={props.driving} />
      <RacingEffects playerRef={playerRef} driving={props.driving} boosted={props.boosted} reducedMotion={props.reducedMotion ?? false} />
      <CameraRig cinematic={props.cinematic} driving={props.driving} mode={props.cameraMode} follow={follow} resetKey={props.resetKey} playerRef={playerRef} active={visible && props.active !== false} boosted={props.boosted} reducedMotion={props.reducedMotion ?? false} />
      </>}
      <ContextMonitor onLost={() => setLost(true)} />
    </Canvas>
  </SceneBoundary>
}
