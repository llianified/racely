'use client'

import { Component, memo, useEffect, useMemo, useRef, useState, type ReactNode, type ComponentRef } from 'react'
import { Flag, RotateCcw } from 'lucide-react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, OrbitControls, RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

const COLORS = { blue: '#7841ee', navy: '#090c1d', surface: '#191939', gray: '#9789cd', white: '#d9d1f4', gold: '#ffce00' }
const HALF = 3.35
export type SceneProps = { progress: number; seconds: number; color: string; boosted: boolean; cameraMode: number; resetKey: number; circuit: number }

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
    <meshStandardMaterial color={color} roughness={.42} metalness={.25} emissive={glow ? color : '#000000'} emissiveIntensity={glow ? 2.2 : 0} toneMapped={!glow} />
  </mesh>
}

const MiniCar = memo(function MiniCar({ color, scale = 1 }: { color: string; scale?: number }) {
  return <group scale={scale}>
    <RoundedBox args={[.43, .09, .82]} radius={.035} position={[0, .12, 0]} castShadow><meshStandardMaterial color={COLORS.navy} roughness={.6} /></RoundedBox>
    <RoundedBox args={[.35, .14, .67]} radius={.035} position={[0, .22, .015]} castShadow><meshStandardMaterial color={color} roughness={.23} metalness={.3} /></RoundedBox>
    <mesh position={[0, .31, -.04]} rotation={[-.2, 0, 0]} castShadow><boxGeometry args={[.21, .12, .23]} /><meshStandardMaterial color={COLORS.navy} roughness={.1} metalness={.4} /></mesh>
    {[-.1, .1].map(x => <mesh key={x} position={[x, .296, .24]} rotation={[-.08, 0, 0]}><boxGeometry args={[.035, .008, .25]} /><meshStandardMaterial color={COLORS.white} /></mesh>)}
    {[-.3, .27].map(z => <group key={z}>
      <mesh position={[0, .13, z]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.025, .025, .65, 8]} /><meshStandardMaterial color={COLORS.gray} metalness={.7} roughness={.3} /></mesh>
      {[-.27, .27].map(x => <group key={x} position={[x, .13, z]}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[.125, .125, .13, 16]} /><meshStandardMaterial color={COLORS.navy} roughness={.9} /></mesh>
        <mesh position={[x > 0 ? .07 : -.07, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.066, .066, .015, 12]} /><meshStandardMaterial color={color} metalness={.4} roughness={.2} /></mesh>
      </group>)}
    </group>)}
    {[-.44, .44].map(z => <group key={z}>
      <mesh position={[0, .125, z]}><boxGeometry args={[.71, .035, .07]} /><meshStandardMaterial color={COLORS.navy} /></mesh>
      {[-.33, .33].map(x => <mesh key={x} position={[x, .16, z]}><cylinderGeometry args={[.075, .075, .06, 12]} /><meshStandardMaterial color={COLORS.gold} metalness={.65} roughness={.25} /></mesh>)}
    </group>)}
    <mesh position={[0, .38, -.33]} castShadow><boxGeometry args={[.52, .045, .16]} /><meshStandardMaterial color={color} roughness={.2} /></mesh>
    {[-.15, .15].map(x => <mesh key={x} position={[x, .3, -.33]}><boxGeometry args={[.025, .14, .05]} /><meshStandardMaterial color={COLORS.navy} /></mesh>)}
  </group>
})

function Racer({ lane, color, progress, seconds, boosted }: { lane: number; color: string; progress: number; seconds: number; boosted: boolean }) {
  const group = useRef<THREE.Group>(null)
  const phase = useRef(lane === 0 ? progress : lane * .32)
  useFrame((_, delta) => {
    if (!group.current || document.hidden) return
    if (lane === 0) {
      const distance = ((progress - phase.current + 1.5) % 1) - .5
      phase.current = (phase.current + Math.min(delta, .1) / seconds + distance * Math.min(delta * 4, 1) + 1) % 1
    } else phase.current = (phase.current + Math.min(delta, .1) / (seconds * (1.16 + lane * .08))) % 1
    const p = trackPoint(phase.current, 2.24 + lane * .68)
    group.current.position.set(p.x, .14, p.z)
    group.current.rotation.y = p.angle
  })
  return <group ref={group}>
    <MiniCar color={color} scale={.85} />
    {lane === 0 && boosted && <pointLight color={COLORS.blue} intensity={3} distance={1.6} position={[0, .1, -.35]} />}
  </group>
}

function TrackBrand() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, 1024, 256)
    ctx.fillStyle = '#9789cd'; ctx.globalAlpha = .32; ctx.textAlign = 'center'
    ctx.font = 'italic 900 116px Arial'; ctx.fillText('RACELY', 512, 145)
    ctx.font = '25px Arial'; ctx.fillText('N I G H T   R A C I N G   C L U B', 512, 205)
    return new THREE.CanvasTexture(canvas)
  }, [])
  useEffect(() => () => texture.dispose(), [texture])
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .023, 0]}><planeGeometry args={[5.6, 1.4]} /><meshBasicMaterial map={texture} transparent depthWrite={false} /></mesh>
}

const Circuit = memo(function Circuit({ circuit }: { circuit: number }) {
  return <group>
    <Ribbon inner={1.7} outer={4.1} height={.12} y={-.14} color="#090c1d" />
    <Ribbon inner={1.85} outer={3.96} height={.10} color="#2c2852" />
    {[0, 1, 2].map(i => <Ribbon key={i} inner={1.9 + i * .68} outer={2.57 + i * .68} height={.11} color={i === 1 ? '#463e7a' : '#2c2852'} />)}
    {[1.88, 2.56, 3.24, 3.92].map((r, i) => <Ribbon key={r} inner={r} outer={r + .055} height={i === 0 || i === 3 ? .28 : .2} color={i === 0 || i === 3 ? '#5027a7' : '#9789cd'} />)}
    {[1.88, 3.92].map(r => <Ribbon key={r} inner={r} outer={r + .06} height={.018} y={.28} glow color={circuit ? COLORS.gold : '#a37ef2'} />)}
    <TrackBrand />
    <group position={[-1.55, 0, -2.95]}>
      {[-1.12, 1.12].map(z => <mesh key={z} position={[0, .85, z]} castShadow><boxGeometry args={[.16, 1.7, .16]} /><meshStandardMaterial color={COLORS.blue} /></mesh>)}
      <mesh position={[0, 1.75, 0]} castShadow><boxGeometry args={[.22, .32, 2.48]} /><meshStandardMaterial color={COLORS.navy} /></mesh>
      {Array.from({ length: 12 }, (_, i) => <mesh key={i} position={[.12, 1.75, -1.1 + i * .2]}><boxGeometry args={[.025, .24, .16]} /><meshStandardMaterial color={i % 2 === 0 ? COLORS.white : COLORS.blue} /></mesh>)}
      {Array.from({ length: 22 }, (_, i) => <mesh key={i} position={[(i % 2) * .15 - .08, .128, -1 + Math.floor(i / 2) * .19]}><boxGeometry args={[.15, .012, .19]} /><meshStandardMaterial color={(Math.floor(i / 2) + i % 2) % 2 === 0 ? COLORS.navy : COLORS.white} /></mesh>)}
    </group>
    {[-5, -3, -1, 1, 3, 5].map((x, i) => <group key={x} position={[x, 0, 4.45]}>
      <mesh position={[0, .19, 0]} castShadow><boxGeometry args={[1.65, .38, .13]} /><meshStandardMaterial color={i % 2 ? COLORS.white : COLORS.blue} /></mesh>
      {[-.65, .65].map(dx => <mesh key={dx} position={[dx, .045, 0]}><boxGeometry args={[.16, .09, .4]} /><meshStandardMaterial color={COLORS.navy} /></mesh>)}
    </group>)}
    {[-2.7, 2.7].map(x => <group key={x} position={[x, 0, 0]}>
      <mesh position={[0, .16, 0]} castShadow><boxGeometry args={[.58, .32, 1.25]} /><meshStandardMaterial color={COLORS.navy} /></mesh>
      <mesh position={[0, .35, 0]}><boxGeometry args={[.64, .06, 1.32]} /><meshStandardMaterial color={COLORS.blue} /></mesh>
    </group>)}
  </group>
})

function CameraRig({ mode, resetKey }: { mode: number; resetKey: number }) {
  const { camera, size } = useThree()
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  useEffect(() => {
    const [x, y, z] = mode === 1 ? [0, 20, .01] : mode === 2 ? [12, 6.5, 10] : [9, 12.5, 12]
    camera.position.set(x, y, z)
    camera.lookAt(0, 0, 0)
    if (camera instanceof THREE.OrthographicCamera) { camera.zoom = Math.min(size.width / 18.5, size.height / 11.5); camera.updateProjectionMatrix() }
    controls.current?.target.set(0, 0, 0); controls.current?.update()
  }, [camera, mode, resetKey, size.width, size.height])
  return <OrbitControls ref={controls} enablePan={false} minZoom={12} maxZoom={95} minPolarAngle={.01} maxPolarAngle={Math.PI / 2.35} enableDamping dampingFactor={.08} />
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
    <Canvas orthographic dpr={[1, 1.25]} frameloop={visible ? 'always' : 'never'} shadows="percentage" camera={{ position: [9, 12.5, 12], zoom: 30, near: .1, far: 100 }} gl={{ antialias: true, alpha: false, powerPreference: 'default' }} fallback={<SceneError onRetry={retry} />} onCreated={() => setReady(true)} aria-label="Arena mini 4WD 3D. Geser untuk memutar, cubit untuk zoom.">
      <color attach="background" args={['#191939']} />
      <ambientLight intensity={.9} />
      <hemisphereLight args={[COLORS.white, COLORS.navy, 1.1]} />
      <directionalLight position={[2, 10, 7]} intensity={2.6} castShadow shadow-mapSize={[512, 512]} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={12} shadow-camera-bottom={-12} shadow-normalBias={.04} />
      <directionalLight position={[-8, 5, -6]} intensity={1.8} color={COLORS.blue} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.16, 0]} receiveShadow><planeGeometry args={[80, 80]} /><meshStandardMaterial color="#090c1d" roughness={.85} /></mesh>
      <Grid position={[0, -.145, 0]} args={[36, 36]} cellSize={1} cellThickness={.35} cellColor="#2c2852" sectionSize={5} sectionThickness={.6} sectionColor="#463e7a" fadeDistance={23} fadeStrength={3} />
      <Circuit circuit={props.circuit} />
      {[0, 1, 2].map(lane => <Racer key={lane} lane={lane} color={lane === 0 ? props.color : lane === 1 ? COLORS.gold : COLORS.white} progress={props.progress} seconds={props.seconds} boosted={props.boosted} />)}
      <CameraRig mode={props.cameraMode} resetKey={props.resetKey} />
      <ContextMonitor onLost={() => setLost(true)} />
    </Canvas>
  </SceneBoundary>
}
