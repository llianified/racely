'use client'

import { memo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { CarModelId } from '@/lib/car-catalog'
import type { GameState } from '@/lib/game'
import { PART_CATALOG, type BodyParts, type PartId } from '@/lib/car-parts'
import { addBodywork, addStockWing, type Finish } from './car-bodywork'
import { CarMarkings } from './car-markings'
import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'

// Palet scene. Nilai yang juga ada sebagai token CSS ditulis sekali di sini
// supaya WebGL dan DOM tidak pelan-pelan melenceng: `muted` = --muted-foreground,
// `success` = --success. `gravel` khusus 3D dan tidak punya padanan di CSS.
export const COLORS = { blue: '#7841ee', navy: '#090c1d', surface: '#191939', gray: '#9789cd', white: '#d9d1f4', gold: '#ffce00', azure: '#4275ff', sky: '#8db5ff', muted: '#b2a5d9', success: '#64e300', gravel: '#a99a85' }

type Point = [number, number]
type Position = [number, number, number]
type Section = [z: number, halfWidth: number, y: number, height: number, x?: number]

const SIDES = [-1, 1] as const
const AXLES = [-.265, .265] as const
const MATERIAL_COLORS = {
  panel: '#25282b', chassis: '#171a1d', rubber: '#151617',
  alloy: '#c2c9ce', gold: '#b59a51', livery: '#f5f4ef', glass: '#091117',
} as const

function sculptedShell(sections: Section[], lengthSegments = 36, radialSegments = 32) {
  const outline = new THREE.CatmullRomCurve3(
    sections.map(([z, width, y]) => new THREE.Vector3(width, y, z)),
    false, 'catmullrom', .35,
  )
  const crossSection = new THREE.CatmullRomCurve3(
    sections.map(([, , , height, x = 0]) => new THREE.Vector3(height, x, 0)),
    false, 'catmullrom', .35,
  )
  const vertices: number[] = []
  const indices: number[] = []
  for (let i = 0; i <= lengthSegments; i++) {
    const profile = outline.getPoint(i / lengthSegments)
    const section = crossSection.getPoint(i / lengthSegments)
    for (let j = 0; j <= radialSegments; j++) {
      const angle = j / radialSegments * Math.PI * 2
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      vertices.push(
        section.y + Math.max(.0001, profile.x) * Math.sign(cos) * Math.abs(cos) ** .8,
        profile.y + Math.max(.0001, section.x) * sin * (sin < 0 ? .38 : 1),
        profile.z,
      )
      if (i < lengthSegments && j < radialSegments) {
        const a = i * (radialSegments + 1) + j
        const b = a + radialSegments + 1
        indices.push(a, a + 1, b, b, a + 1, b + 1)
      }
    }
  }
  for (const end of [0, lengthSegments]) {
    const profile = outline.getPoint(end / lengthSegments)
    const section = crossSection.getPoint(end / lengthSegments)
    const center = vertices.length / 3
    vertices.push(section.y, profile.y, profile.z)
    for (let j = 0; j < radialSegments; j++) {
      const a = end * (radialSegments + 1) + j
      if (end === 0) indices.push(center, a + 1, a)
      else indices.push(center, a, a + 1)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function plate(outline: Point[], thickness: number, holes: [number, number, number][] = []) {
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)))
  shape.closePath()
  for (const [x, z, radius] of holes) {
    const hole = new THREE.Path()
    hole.absarc(x, -z, radius, 0, Math.PI * 2, true)
    shape.holes.push(hole)
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSize: .002,
    bevelThickness: .002,
    bevelSegments: 2,
    steps: 1,
    curveSegments: 12,
  })
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

function turned(profile: Point[], segments = 48) {
  return new THREE.LatheGeometry(profile.map(([radius, y]) => new THREE.Vector2(radius, y)), segments)
}

// Parts are flattened to triangle soup so they can be merged per finish; weld the soup back
// into an indexed buffer afterwards. Only exact duplicates (position + normal) merge, so
// every hard edge and every shading normal stays as it was.
function mergeIndexed(geometries: THREE.BufferGeometry[]) {
  const soup = mergeGeometries(geometries)!
  geometries.forEach(geometry => geometry.dispose())
  const indexed = mergeVertices(soup, 1e-6)
  soup.dispose()
  indexed.computeBoundingSphere()
  return indexed
}

function createCarGeometry(model: CarModelId) {
  const parts: Record<Finish, THREE.BufferGeometry[]> = {
    body: [], panel: [], chassis: [], rubber: [], alloy: [], gold: [], livery: [], glass: [],
  }
  const internalParts: Partial<Record<Finish, THREE.BufferGeometry[]>> = {}
  let internal = false
  let spoiler = false
  const spoilerParts: Partial<Record<Finish, THREE.BufferGeometry[]>> = {}
  const wheels: { position: Position; parts: Partial<Record<Finish, THREE.BufferGeometry[]>> }[] = []
  let currentWheel: (typeof wheels)[number] | null = null
  const add = (finish: Finish, geometry: THREE.BufferGeometry, position: Position = [0, 0, 0], rotation: Position = [0, 0, 0]) => {
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation)))
    geometry.translate(...position)
    const triangles = geometry.index ? geometry.toNonIndexed() : geometry
    if (triangles !== geometry) geometry.dispose()
    for (const name of Object.keys(triangles.attributes)) {
      if (name !== 'position' && name !== 'normal') triangles.deleteAttribute(name)
    }
    if (currentWheel) {
      const [x, y, z] = currentWheel.position
      triangles.translate(-x, -y, -z)
      const wheelFinish = currentWheel.parts[finish] ??= []
      wheelFinish.push(triangles)
    } else if (spoiler) {
      const spoilerFinish = spoilerParts[finish] ??= []
      spoilerFinish.push(triangles)
    } else if (internal) {
      const internalFinish = internalParts[finish] ??= []
      internalFinish.push(triangles)
    } else parts[finish].push(triangles)
  }
  const cylinder = (radius: number, height: number, segments = 32) => new THREE.CylinderGeometry(radius, radius, height, segments)
  const ring = (radius: number, tube: number) => new THREE.TorusGeometry(radius, tube, 8, 48)

  add('chassis', plate([
    [-.115, -.36], [-.184, -.29], [-.184, -.20], [-.145, -.14],
    [-.145, .15], [-.184, .21], [-.184, .30], [-.095, .385],
    [.095, .385], [.184, .30], [.184, .21], [.145, .15],
    [.145, -.14], [.184, -.20], [.184, -.29], [.115, -.36],
  ], .035), [0, .082, 0])

  addBodywork(model, add)

  for (const z of AXLES) {
    add('alloy', cylinder(.010, .565, 16), [0, .124, z], [0, 0, Math.PI / 2])
    for (const side of SIDES) {
      const x = side * .255
      currentWheel = { position: [x, .124, z], parts: {} }
      wheels.push(currentWheel)
      add('rubber', turned([
        [.077, -.057], [.104, -.057], [.114, -.053], [.120, -.045],
        [.122, -.031], [.122, .031], [.120, .045], [.114, .053],
        [.104, .057], [.077, .057], [.077, -.057],
      ]), [x, .124, z], [0, 0, Math.PI / 2])
      const rimFinish = model === 'neo-falcon' ? 'body' : model === 'phantom-x' ? 'gold' : 'alloy'
      add(rimFinish, turned([
        [.073, -.045], [.081, -.045], [.085, -.039], [.085, .039],
        [.081, .045], [.073, .045], [.073, -.045],
      ]), [x, .124, z], [0, 0, Math.PI / 2])
      const faceX = x + side * .046
      add(rimFinish, ring(.081, .0035), [faceX, .124, z], [0, Math.PI / 2, 0])
      add('rubber', ring(.107, .0015), [x + side * .054, .124, z], [0, Math.PI / 2, 0])
      add('body', cylinder(.027, .020), [faceX, .124, z], [0, 0, Math.PI / 2])
      add('alloy', cylinder(.010, .023, 6), [faceX + side * .004, .124, z], [0, 0, Math.PI / 2])
      const spokeCount = model === 'neo-falcon' ? 12 : model === 'phantom-x' ? 10 : 8
      for (let spoke = 0; spoke < spokeCount; spoke++) {
        const angle = spoke / spokeCount * Math.PI * 2
        const spokeGeometry = plate([
          [.022, -.004], [.055, -.006], [.080, -.003], [.080, .002], [.052, .003], [.022, .005],
        ], .005)
        spokeGeometry.rotateX(Math.PI / 2)
        spokeGeometry.rotateZ(angle)
        spokeGeometry.rotateY(Math.PI / 2)
        add(rimFinish, spokeGeometry, [faceX, .124, z])
      }
      for (const offset of [-.028, 0, .028]) {
        add('chassis', ring(.122, .0012), [x + offset, .124, z], [0, Math.PI / 2, 0])
      }
      for (let mark = 0; mark < 2; mark++) {
        const angle = mark * Math.PI
        add('livery', new THREE.BoxGeometry(.001, .012, .022),
          [x + side * .0575, .124 + Math.cos(angle) * .099, z + Math.sin(angle) * .099], [angle, 0, 0])
      }
      currentWheel = null
    }
  }

  for (const end of SIDES) {
    const z = end * .425
    const outline: Point[] = [
      [-.350, -.028], [-.298, -.047], [-.177, -.026], [-.112, -.056],
      [.112, -.056], [.177, -.026], [.298, -.047], [.350, -.028],
      [.350, .024], [.294, .046], [.130, .007], [-.130, .007],
      [-.294, .046], [-.350, .024],
    ]
    add('chassis', plate(outline.map(([x, dz]) => [x, dz * end]), .013,
      [-.24, -.19, .19, .24].map(x => [x, 0, .009])), [0, .10, z])
    add('alloy', plate(outline.map(([x, dz]) => [x, dz * end]), .002,
      [-.24, -.19, .19, .24].map(x => [x, 0, .009])), [0, .099, z])
    add('body', plate([
      [-.30, -.026], [-.15, -.042], [.15, -.042], [.30, -.026],
      [.30, .023], [.14, .007], [-.14, .007], [-.30, .023],
    ].map(([x, dz]) => [x, dz * end]), .009), [0, .083, z])
    for (const x of [-.268, -.214, -.155, -.08, .08, .155, .214, .268]) {
      add('alloy', cylinder(.009, .004, 12), [x, .118, z - end * .015])
      add('chassis', new THREE.BoxGeometry(.012, .001, .002), [x, .1205, z - end * .015])
    }
    for (const side of SIDES) {
      const x = side * .324
      const rear = end < 0
      const top = rear ? .336 : .29
      add('alloy', cylinder(.008, top - .103, 16), [x, (top + .103) / 2, z])
      add('alloy', cylinder(.015, .026, 24), [x, .171, z])
      add('rubber', new THREE.SphereGeometry(.018, 16, 12), [x, top, z])
      add('alloy', cylinder(.01, .004, 12), [x, top - .016, z])
      add('alloy', cylinder(.012, .008, 6), [side * .112, .123, z - end * .035])
      const damperX = side * .197
      const damperZ = z - end * .056
      add('alloy', cylinder(.006, .094, 12), [damperX, .164, damperZ])
      add('gold', cylinder(.026, .038, 32), [damperX, .145, damperZ])
      add('alloy', cylinder(.009, .004, 12), [damperX, .213, damperZ])
      add('chassis', ring(.025, .0015), [damperX, .16, damperZ], [Math.PI / 2, 0, 0])
    }
  }

  spoiler = true
  addStockWing(model, add)
  spoiler = false
  internal = true
  add('alloy', cylinder(.037, .15), [0, .158, -.225], [0, 0, Math.PI / 2])
  for (const side of SIDES) {
    add('chassis', cylinder(.039, .018), [side * .074, .158, -.225], [0, 0, Math.PI / 2])
    add('gold', cylinder(.044, .30), [side * .061, .154, .026], [Math.PI / 2, 0, 0])
    for (const end of SIDES) {
      add('alloy', cylinder(.043, .012), [side * .061, .154, .026 + end * .153], [Math.PI / 2, 0, 0])
      add('alloy', cylinder(.014, .006), [side * .061, .154, .026 + end * .163], [Math.PI / 2, 0, 0])
    }
    add('chassis', new THREE.BoxGeometry(.019, .014, .27), [side * .061, .195, .026])
  }
  for (const z of [-.05, .10]) {
    add('chassis', new THREE.BoxGeometry(.23, .014, .022), [0, .201, z])
    for (const side of SIDES) add('alloy', cylinder(.007, .006, 6), [side * .108, .212, z])
  }

  const merge = (groups: Partial<Record<Finish, THREE.BufferGeometry[]>>) =>
    Object.fromEntries(Object.entries(groups).filter(([, geometries]) => geometries.length).map(([finish, geometries]) => [finish, mergeIndexed(geometries)])) as Partial<Record<Finish, THREE.BufferGeometry>>
  return { shell: merge(parts), spoiler: merge(spoilerParts), internals: merge(internalParts), wheels: wheels.map(wheel => ({ position: wheel.position, parts: merge(wheel.parts) })) }
}

// Both canvases share immutable geometry; batch details by finish instead of drawing each bolt separately.
const GEOMETRY_CACHE: Partial<Record<CarModelId, ReturnType<typeof createCarGeometry>>> = {}

type RollerId = NonNullable<GameState['setup']>['roller']

function createRollerGeometry(roller: RollerId) {
  const parts: Partial<Record<Finish, THREE.BufferGeometry[]>> = {}
  const radiusScale = roller === 'light' ? .72 : roller === 'heavy' ? 1.3 : 1
  const heightScale = roller === 'light' ? .8 : roller === 'heavy' ? 1.15 : 1
  const add = (finish: Finish, geometry: THREE.BufferGeometry, position: Position, horizontal = false) => {
    if (horizontal) geometry.rotateX(Math.PI / 2)
    geometry.translate(...position)
    const triangles = geometry.index ? geometry.toNonIndexed() : geometry
    if (triangles !== geometry) geometry.dispose()
    for (const name of Object.keys(triangles.attributes)) if (name !== 'position' && name !== 'normal') triangles.deleteAttribute(name)
    ;(parts[finish] ??= []).push(triangles)
  }
  for (const end of SIDES) for (const side of SIDES) {
    const x = side * .324
    const z = end * .425
    const rear = end < 0
    for (const y of [rear ? .144 : .135, rear ? .295 : .155]) {
      const disc = turned([
        [.009, -.008], [.049, -.008], [.057, -.004], [.057, .003],
        [.05, .008], [.009, .008], [.009, -.008],
      ], 32)
      disc.scale(radiusScale, heightScale, radiusScale)
      add(roller === 'heavy' ? 'alloy' : 'body', disc, [x, y, z])
      add(roller === 'light' ? 'body' : 'rubber', new THREE.TorusGeometry(.055 * radiusScale, .0017, 8, 48), [x, y, z], true)
      add('alloy', new THREE.CylinderGeometry(.015, .015, .004, 24), [x, y + .01, z])
      add('chassis', new THREE.CylinderGeometry(.006, .006, .005, 6), [x, y + .014, z])
      for (let hole = 0; hole < 5; hole++) {
        const angle = hole / 5 * Math.PI * 2
        add('chassis', new THREE.CylinderGeometry(.003, .003, .001, 8), [x + Math.cos(angle) * .037 * radiusScale, y + .0085 * heightScale, z + Math.sin(angle) * .037 * radiusScale])
      }
      if (roller === 'heavy') {
        add('alloy', new THREE.TorusGeometry(.065, .003, 8, 32), [x, y + .006, z], true)
        add('chassis', new THREE.TorusGeometry(.022, .0025, 8, 24), [x, y + .01, z], true)
      }
    }
  }
  return Object.fromEntries(Object.entries(parts).map(([finish, geometries]) => [finish, mergeIndexed(geometries!)])) as Partial<Record<Finish, THREE.BufferGeometry>>
}

// Three small shared roller sets; swapping setup never duplicates the body or wheels.
const ROLLER_CACHE: Partial<Record<RollerId, ReturnType<typeof createRollerGeometry>>> = {}

const Rollers = memo(function Rollers({ roller, color, model }: { roller: RollerId; color: string; model: CarModelId }) {
  const parts = ROLLER_CACHE[roller] ?? (ROLLER_CACHE[roller] = createRollerGeometry(roller))
  return <group name={`rollers-${roller}`}><CarSurfaces parts={parts} color={roller === 'light' ? COLORS.white : color} model={model} plastic={roller === 'light'} /></group>
})

function CarSurfaces({ parts, color, model, inspect = false, plastic = false }: {
  parts: Partial<Record<Finish, THREE.BufferGeometry>>; color: string; model: CarModelId; inspect?: boolean; plastic?: boolean
}) {
  return <>{(Object.entries(parts) as [Finish, THREE.BufferGeometry][]).map(([finish, geometry]) => {
    if (inspect && ['body', 'panel', 'glass', 'livery'].includes(finish)) return null
    return <mesh key={finish} geometry={geometry} dispose={null} castShadow receiveShadow>
      {finish === 'body' && plastic ? <meshStandardMaterial color={color} roughness={.72} metalness={0} />
        : finish === 'body' ? <meshPhysicalMaterial color={color} roughness={.29} metalness={.25} clearcoat={1} clearcoatRoughness={.16} />
        : finish === 'panel' ? <meshPhysicalMaterial color={MATERIAL_COLORS.panel} roughness={.31} metalness={.42} clearcoat={.7} />
        : finish === 'glass' ? <meshPhysicalMaterial color={MATERIAL_COLORS.glass} roughness={.12} metalness={.35} clearcoat={1} clearcoatRoughness={.06} />
        : <meshStandardMaterial
          color={finish === 'gold' && model === 'luna-gt' ? MATERIAL_COLORS.alloy : MATERIAL_COLORS[finish]}
          roughness={finish === 'rubber' ? .92 : finish === 'chassis' ? .58 : .27}
          metalness={['alloy', 'gold'].includes(finish) ? .85 : finish === 'chassis' ? .3 : 0}
        />}
    </mesh>
  })}</>
}

function RollingWheel({ wheel, color, model, speed, speedRef, level }: {
  wheel: ReturnType<typeof createCarGeometry>['wheels'][number]; color: string; model: CarModelId; speed: number; speedRef?: RefObject<number>; level: number
}) {
  const group = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (group.current && !document.hidden) group.current.rotation.x = (group.current.rotation.x + Math.min(delta, .05) * (speedRef?.current ?? speed) / .122) % (Math.PI * 2)
  })
  return <group ref={group} position={wheel.position} scale={[1 + (level - 1) * .025, 1, 1]}>
    <CarSurfaces parts={wheel.parts} color={color} model={model} />
    {level > 1 && <mesh position={[Math.sign(wheel.position[0]) * .059, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
      <torusGeometry args={[.092, .004 + level * .0005, 8, 32]} />
      <meshStandardMaterial color={COLORS.gold} metalness={.8} roughness={.25} />
    </mesh>}
  </group>
}

function createAeroGeometry(id: PartId, model: CarModelId) {
  const groups: Partial<Record<Finish, THREE.BufferGeometry[]>> = {}
  const add = (finish: Finish, geometry: THREE.BufferGeometry, position: Position = [0, 0, 0], rotation: Position = [0, 0, 0]) => {
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation)))
    geometry.translate(...position)
    const triangles = geometry.index ? geometry.toNonIndexed() : geometry
    if (triangles !== geometry) geometry.dispose()
    for (const name of Object.keys(triangles.attributes)) if (name !== 'position' && name !== 'normal') triangles.deleteAttribute(name)
    ;(groups[finish] ??= []).push(triangles)
  }
  const box = (finish: Finish, size: Position, position: Position, rotation?: Position) => add(finish, new THREE.BoxGeometry(...size), position, rotation)
  const luna = model === 'luna-gt'
  if (PART_CATALOG[id].slot === 'hood') {
    const width = luna ? .13 : .078
    add('chassis', sculptedShell([
      [.18, width * .7, luna ? .195 : .213, .008], [.24, width, .191, .012],
      [.31, width * .88, .176, .008], [.382, width * .72, .148, .004],
    ], 24, 24))
    if (id === 'vented-hood') {
      for (const side of SIDES) for (let i = 0; i < 4; i++) {
        box('alloy', [width * .55, .004, .009], [side * width * .45, .205 - i * .009, .225 + i * .025], [-.27, 0, 0])
      }
    } else {
      add('chassis', sculptedShell([[.19, .012, .218, .006], [.23, .034, .227, .025], [.28, .034, .218, .026], [.30, .032, .214, .022]], 24, 24))
      box('rubber', [.052, .029, .004], [0, .226, .302])
      box('alloy', [.065, .004, .006], [0, .244, .302])
    }
    for (const side of SIDES) add('alloy', new THREE.CylinderGeometry(.005, .005, .004, 12), [side * width * .7, .182, .31])
  } else if (id === 'ducktail') {
    add('body', sculptedShell([[-.21, .018, 0, .005], [-.15, .036, .008, .012], [0, .043, .01, .014], [.15, .036, .008, .012], [.21, .018, 0, .005]], 32, 20), [0, .225, -.322], [0, Math.PI / 2, 0])
    for (const side of SIDES) box('chassis', [.014, .04, .035], [side * .095, .198, -.305])
  } else if (id === 'gt-wing' || id === 'crown-wing') {
    // Crown Wing (hadiah 10 teman) memakai rangka GT yang sama, seluruhnya emas.
    const frame: Finish = id === 'crown-wing' ? 'gold' : 'chassis'
    for (const side of SIDES) {
      box('alloy', [.028, .013, .052], [side * .105, .208, -.299])
      box(frame, [.013, .135, .022], [side * .105, .272, -.30], [.2, 0, 0])
      box(frame, [.013, .023, .055], [side * .105, .342, -.317])
      add(frame, plate([[-.047, -.02], [.047, -.018], [.056, .023], [-.035, .034]], .008), [side * .263, .361, -.333], [0, 0, Math.PI / 2])
      box('gold', [.035, .003, .088], [side * .215, .337, -.334])
      if (id === 'crown-wing') box('gold', [.012, .028, .006], [side * .19, .378, -.338])
    }
    add(frame, sculptedShell([[-.26, .037, 0, .006], [-.19, .058, .004, .011], [0, .053, .009, .013], [.19, .058, .004, .011], [.26, .037, 0, .006]], 36, 24), [0, .325, -.336], [0, Math.PI / 2, 0])
  } else if (id === 'front-splitter' || id === 'neon-fin') {
    // Neon Fin (hadiah 3 teman): bilah emas dengan sirip tegak di kedua ujung.
    const blade: Finish = id === 'neon-fin' ? 'gold' : 'chassis'
    add(blade, plate([[-.22, .30], [-.19, .39], [-.12, .415], [.12, .415], [.19, .39], [.22, .30], [.15, .325], [-.15, .325]], .01), [0, .09, 0])
    for (const side of SIDES) box('alloy', [.006, .076, .006], [side * .14, .132, .355], [-.28, 0, side * .12])
    if (id === 'neon-fin') for (const side of SIDES) box('gold', [.005, .05, .07], [side * .2, .118, .34], [.15, 0, 0])
  } else {
    for (const side of SIDES) {
      add('chassis', plate([[-.023, -.17], [.03, -.14], [.027, .16], [-.014, .18]], .012), [side * .177, .079, 0])
      box('gold', [.006, .006, .25], [side * .201, .095, 0])
      box('chassis', [.009, .045, .046], [side * .195, .107, -.145], [-.3, 0, side * .2])
    }
  }
  return Object.fromEntries(Object.entries(groups).map(([finish, geometries]) => [finish, mergeIndexed(geometries!)])) as Partial<Record<Finish, THREE.BufferGeometry>>
}

const AERO_CACHE = new Map<string, ReturnType<typeof createAeroGeometry>>()
const AeroPart = memo(function AeroPart({ id, model, color }: { id: PartId; model: CarModelId; color: string }) {
  const key = `${model}:${id}`
  let geometry = AERO_CACHE.get(key)
  if (!geometry) { geometry = createAeroGeometry(id, model); AERO_CACHE.set(key, geometry) }
  return <group name={`part-${id}`}><CarSurfaces parts={geometry} color={color} model={model} /></group>
})

const STOCK_LEVELS = { engine: 1, tires: 1, battery: 1 };

const InstalledParts = memo(function InstalledParts({ levels, inspect }: { levels: GameState['levels']; inspect: boolean }) {
  return <group name="installed-modifications">
    {levels.engine > 1 && <group name="motor-heatsink" position={[0, .218, -.36]}>
      <mesh castShadow><boxGeometry args={[.18, .025, .085]} /><meshStandardMaterial color={COLORS.navy} metalness={.65} roughness={.3} /></mesh>
      {Array.from({ length: levels.engine + 1 }, (_, index) => <mesh key={index} position={[(index - levels.engine / 2) * .016, .025, 0]} castShadow>
        <boxGeometry args={[.008, .04 + levels.engine * .003, .085]} />
        <meshStandardMaterial color={COLORS.gold} metalness={.8} roughness={.28} />
      </mesh>)}
    </group>}
    {levels.tires > 1 && SIDES.flatMap(end => SIDES.map(side => <mesh key={`${end}:${side}`} position={[side * .324, .21, end * .425]} castShadow>
      <cylinderGeometry args={[.042 + levels.tires * .001, .042 + levels.tires * .001, .012 + levels.tires * .002, 24]} />
      <meshStandardMaterial color={COLORS.gold} metalness={.8} roughness={.25} />
    </mesh>))}
    {levels.battery > 1 && SIDES.map(side => <group key={side} name="battery-retainer" position={[side * (inspect ? .061 : .205), inspect ? .20 : .16, .03]}>
      <mesh castShadow><boxGeometry args={[.025, .025, .24]} /><meshStandardMaterial color={COLORS.navy} roughness={.5} metalness={.5} /></mesh>
      {Array.from({ length: levels.battery - 1 }, (_, index) => <mesh key={index} position={[0, .016, -.096 + index * .024]} castShadow>
        <boxGeometry args={[.033, .012, .012]} /><meshStandardMaterial color={COLORS.gold} metalness={.7} roughness={.3} />
      </mesh>)}
    </group>)}
  </group>
})

export const MiniCar = memo(function MiniCar({ color, model = 'neo-falcon', scale = 1, speed = 0, speedRef, inspect = false, charge = 1, levels = STOCK_LEVELS, equipped, roller = 'standard' }: {
  color: string; model?: CarModelId; scale?: number; speed?: number; speedRef?: RefObject<number>; inspect?: boolean; charge?: number; levels?: GameState['levels']; equipped?: BodyParts['equipped']; roller?: RollerId
}) {
  const geometry = GEOMETRY_CACHE[model] ?? (GEOMETRY_CACHE[model] = createCarGeometry(model))
  return <group scale={scale}>
    <CarSurfaces parts={geometry.shell} color={color} model={model} inspect={inspect} />
    {!inspect && <CarMarkings model={model} stockWing={!equipped?.spoiler} />}
    {!equipped?.spoiler && <CarSurfaces parts={geometry.spoiler} color={color} model={model} inspect={inspect} />}
    {!inspect && Object.values(equipped ?? {}).map(id => <AeroPart key={id} id={id} color={color} model={model} />)}
    {inspect && <CarSurfaces parts={geometry.internals} color={color} model={model} />}
    <Rollers roller={roller} color={color} model={model} />
    <InstalledParts levels={levels} inspect={inspect} />
    {geometry.wheels.map((wheel, index) => <RollingWheel key={index} wheel={wheel} color={color} model={model} speed={speed} speedRef={speedRef} level={levels.tires} />)}
    {inspect && Array.from({ length: 5 }, (_, index) => <mesh key={index} position={[(index - 2) * .023, .216, -.157]}>
      <boxGeometry args={[.016, .008, .018]} />
      <meshStandardMaterial color={COLORS.navy} emissive={COLORS.gold} emissiveIntensity={charge > index / 5 ? 1.8 : 0} />
    </mesh>)}
  </group>
})
