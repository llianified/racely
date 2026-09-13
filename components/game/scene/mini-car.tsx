'use client'

import { memo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { CarModelId } from '@/lib/car-catalog'
import type { GameState } from '@/lib/game'
import { PART_CATALOG, type BodyParts, type PartId } from '@/lib/car-parts'
import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'

// Palet scene. Nilai yang juga ada sebagai token CSS ditulis sekali di sini
// supaya WebGL dan DOM tidak pelan-pelan melenceng: `muted` = --muted-foreground,
// `success` = --success. `gravel` khusus 3D dan tidak punya padanan di CSS.
export const COLORS = { blue: '#7841ee', navy: '#090c1d', surface: '#191939', gray: '#9789cd', white: '#d9d1f4', gold: '#ffce00', azure: '#4275ff', sky: '#8db5ff', muted: '#b2a5d9', success: '#64e300', gravel: '#a99a85' }

type Point = [number, number]
type Position = [number, number, number]
type Section = [z: number, halfWidth: number, y: number, height: number, x?: number]
type Finish = 'body' | 'chassis' | 'rubber' | 'alloy' | 'gold' | 'livery' | 'glass'

const SIDES = [-1, 1] as const
const AXLES = [-.265, .265] as const

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
    body: [], chassis: [], rubber: [], alloy: [], gold: [], livery: [], glass: [],
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

  if (model === 'neo-falcon') {
  add('body', sculptedShell([
    [-.355, .053, .151, .013], [-.29, .101, .173, .046],
    [-.19, .114, .190, .058], [-.075, .104, .190, .061],
    [.045, .080, .181, .060], [.17, .067, .165, .044],
    [.30, .079, .147, .025], [.385, .088, .134, .009],
  ]))

  add('glass', sculptedShell([
    [-.214, .035, .240, .003], [-.15, .066, .245, .051],
    [-.06, .067, .240, .068], [.035, .052, .227, .054],
    [.135, .027, .205, .013], [.165, .002, .194, .002],
  ], 36, 40))

  for (const side of SIDES) {
    add('body', sculptedShell([
      [-.325, .010, .163, .008, side * .117],
      [-.22, .030, .193, .043, side * .147],
      [-.09, .049, .187, .050, side * .166],
      [.075, .041, .179, .034, side * .167],
      [.18, .018, .159, .018, side * .133],
      [.315, .004, .140, .006, side * .090],
    ]))
    add('livery', sculptedShell([
      [-.275, .005, .223, .003, side * .136],
      [-.16, .010, .241, .003, side * .165],
      [-.045, .011, .238, .003, side * .179],
      [.075, .006, .214, .003, side * .177],
      [.18, .001, .177, .002, side * .140],
    ], 24, 8))
    add('livery', sculptedShell([
      [.115, .001, .226, .002, side * .031],
      [.20, .009, .205, .002, side * .034],
      [.30, .012, .174, .002, side * .037],
      [.379, .014, .145, .002, side * .040],
    ], 24, 8))
    add('livery', sculptedShell([
      [-.15, .002, .285, .002, side * .059],
      [-.045, .003, .290, .002, side * .062],
      [.055, .002, .253, .002, side * .048],
      [.14, .001, .213, .001, side * .023],
    ], 24, 8))

    add('chassis', sculptedShell([
      [-.125, .020, .199, .010, side * .208],
      [-.04, .025, .194, .016, side * .208],
      [.065, .021, .186, .013, side * .202],
      [.10, .009, .177, .003, side * .189],
    ], 16, 16))
    for (let i = 0; i < 4; i++) {
      add('chassis', plate([[-.020, -.004], [.020, -.004], [.014, .004], [-.020, .004]], .002),
        [side * .151, .235 - i * .003, -.117 + i * .027], [0, side * .18, side * -.18])
    }
    add('chassis', plate([
      [-.037, -.22], [.025, -.17], [.025, .15], [-.027, .21], [-.037, .12],
    ].map(([x, z]) => [x * side, z] as Point), .013), [side * .165, .099, 0])
  }

  } else {
    add('body', sculptedShell([
      [-.35, .095, .153, .018], [-.28, .15, .176, .046],
      [-.13, .172, .184, .055], [.045, .163, .179, .048],
      [.19, .145, .158, .036], [.31, .135, .146, .029],
      [.38, .083, .139, .010],
    ]))
    add('glass', sculptedShell([
      [-.24, .060, .217, .009], [-.16, .108, .231, .065],
      [-.055, .112, .229, .085], [.06, .092, .219, .064],
      [.17, .038, .189, .013], [.19, .002, .181, .002],
    ], 36, 40))
    add('body', sculptedShell([
      [-.165, .015, .289, .002], [-.12, .074, .297, .010],
      [-.055, .087, .305, .010], [.015, .062, .295, .008],
      [.04, .006, .277, .002],
    ], 24, 32))
    for (const side of SIDES) {
      add('body', sculptedShell([
        [-.32, .010, .156, .006, side * .13],
        [-.24, .042, .177, .040, side * .161],
        [-.05, .032, .165, .035, side * .178],
        [.17, .035, .15, .028, side * .159],
        [.32, .008, .139, .009, side * .115],
      ]))
      add('livery', sculptedShell([
        [-.29, .003, .143, .003, side * .159],
        [-.14, .004, .148, .004, side * .188],
        [.08, .004, .14, .004, side * .184],
        [.26, .002, .128, .003, side * .148],
      ], 24, 12))
      const lamp = new THREE.SphereGeometry(1, 24, 12)
      lamp.scale(.034, .012, .018)
      add('livery', lamp, [side * .091, .173, .316], [-.25, side * -.25, 0])
      const rearLamp = new THREE.SphereGeometry(1, 16, 8)
      rearLamp.scale(.029, .007, .008)
      add('livery', rearLamp, [side * .088, .169, -.341])
    }
    add('chassis', sculptedShell([
      [.34, .06, .127, .008], [.369, .066, .126, .009], [.387, .04, .125, .003],
    ], 12, 16))
  }

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
      add('alloy', turned([
        [.073, -.045], [.081, -.045], [.085, -.039], [.085, .039],
        [.081, .045], [.073, .045], [.073, -.045],
      ]), [x, .124, z], [0, 0, Math.PI / 2])
      const faceX = x + side * .046
      add('alloy', ring(.081, .0035), [faceX, .124, z], [0, Math.PI / 2, 0])
      add('rubber', ring(.107, .0015), [x + side * .054, .124, z], [0, Math.PI / 2, 0])
      add('body', cylinder(.027, .020), [faceX, .124, z], [0, 0, Math.PI / 2])
      add('alloy', cylinder(.010, .023, 6), [faceX + side * .004, .124, z], [0, 0, Math.PI / 2])
      for (let spoke = 0; spoke < 6; spoke++) {
        const angle = spoke / 6 * Math.PI * 2
        const spokeGeometry = plate([
          [.022, -.009], [.070, -.011], [.079, -.001], [.068, .010], [.022, .005],
        ], .008)
        spokeGeometry.rotateX(Math.PI / 2)
        spokeGeometry.rotateZ(angle)
        spokeGeometry.rotateY(Math.PI / 2)
        add('alloy', spokeGeometry, [faceX, .124, z])
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
    for (const side of SIDES) {
      const x = side * .324
      add('alloy', cylinder(.010, .099, 16), [x, .151, z])
      add('gold', turned([
        [.011, -.014], [.048, -.014], [.057, -.010], [.059, -.004],
        [.059, .006], [.056, .012], [.048, .014], [.011, .014], [.011, -.014],
      ]), [x, .140, z])
      add('rubber', ring(.058, .003), [x, .140, z], [Math.PI / 2, 0, 0])
      add('alloy', cylinder(.021, .006), [x, .158, z])
      add('chassis', cylinder(.009, .008, 6), [x, .164, z])
      add('gold', cylinder(.032, .012), [x, .186, z])
      add('alloy', cylinder(.009, .005, 6), [x, .195, z])
      for (let hole = 0; hole < 6; hole++) {
        const angle = hole / 6 * Math.PI * 2
        add('chassis', cylinder(.006, .0015, 12),
          [x + Math.cos(angle) * .037, .155, z + Math.sin(angle) * .037])
      }
      add('alloy', cylinder(.012, .008, 6), [side * .112, .123, z - end * .035])
    }
  }

  spoiler = true
  if (model === 'neo-falcon') {
  for (const side of SIDES) {
    add('chassis', plate([
      [-.010, -.054], [.010, -.050], [.009, .045], [-.005, .046],
    ], .013), [side * .12, .234, -.304], [.68, 0, 0])
    add('body', sculptedShell([
      [-.057, .015, 0, .003], [-.047, .040, 0, .003],
      [.035, .041, 0, .003], [.059, .016, 0, .003],
    ], 16, 12), [side * .247, .349, -.336], [0, 0, Math.PI / 2])
    add('livery', plate([[-.012, -.05], [.012, -.05], [.012, .04], [-.012, .04]], .001),
      [side * .198, .350, -.334], [0, 0, side * -.055])
    add('alloy', cylinder(.009, .006, 6), [side * .12, .251, -.266])
  }
  add('body', sculptedShell([
    [-.249, .041, 0, .006], [-.222, .057, 0, .011],
    [-.12, .050, .006, .012], [0, .045, .009, .012],
    [.12, .050, .006, .012], [.222, .057, 0, .011], [.249, .041, 0, .006],
  ], 40, 24), [0, .333, -.336], [0, Math.PI / 2, 0])
  add('chassis', plate([[-.087, -.016], [.087, -.016], [.072, .016], [-.072, .016]], .012), [0, .202, -.304])
  for (let i = 0; i < 5; i++) {
    add('alloy', cylinder(.003, .132, 8), [0, .195 - i * .009, -.336], [0, 0, Math.PI / 2])
  }

  } else {
    for (const side of SIDES) {
      add('chassis', new THREE.BoxGeometry(.015, .05, .025), [side * .09, .214, -.29])
    }
    add('body', sculptedShell([
      [-.18, .016, 0, .004], [-.14, .035, .003, .009],
      [0, .038, .009, .011], [.14, .035, .003, .009], [.18, .016, 0, .004],
    ], 32, 20), [0, .249, -.299], [0, Math.PI / 2, 0])
    add('livery', new THREE.BoxGeometry(.25, .003, .009), [0, .258, -.327])
  }

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

function CarSurfaces({ parts, color, model, inspect = false }: {
  parts: Partial<Record<Finish, THREE.BufferGeometry>>; color: string; model: CarModelId; inspect?: boolean
}) {
  return <>{(Object.entries(parts) as [Finish, THREE.BufferGeometry][]).map(([finish, geometry]) => {
    if (inspect && ['body', 'glass', 'livery'].includes(finish)) return null
    return <mesh key={finish} geometry={geometry} dispose={null} castShadow receiveShadow>
      {finish === 'body' ? <meshPhysicalMaterial color={color} roughness={.24} metalness={.35} clearcoat={1} clearcoatRoughness={.12} />
        : finish === 'glass' ? <meshPhysicalMaterial color={COLORS.navy} roughness={.08} metalness={.15} clearcoat={1} clearcoatRoughness={.04} />
        : <meshStandardMaterial
          color={finish === 'gold' ? (model === 'luna-gt' ? COLORS.white : COLORS.gold) : ['alloy', 'livery'].includes(finish) ? COLORS.white : COLORS.navy}
          roughness={finish === 'rubber' ? .96 : finish === 'chassis' ? .68 : .3}
          metalness={['alloy', 'gold'].includes(finish) ? .85 : finish === 'chassis' ? .15 : 0}
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
  } else if (id === 'gt-wing') {
    for (const side of SIDES) {
      box('alloy', [.028, .013, .052], [side * .105, .208, -.299])
      box('chassis', [.013, .135, .022], [side * .105, .272, -.30], [.2, 0, 0])
      box('chassis', [.013, .023, .055], [side * .105, .342, -.317])
      add('chassis', plate([[-.047, -.02], [.047, -.018], [.056, .023], [-.035, .034]], .008), [side * .263, .361, -.333], [0, 0, Math.PI / 2])
      box('gold', [.035, .003, .088], [side * .215, .337, -.334])
    }
    add('chassis', sculptedShell([[-.26, .037, 0, .006], [-.19, .058, .004, .011], [0, .053, .009, .013], [.19, .058, .004, .011], [.26, .037, 0, .006]], 36, 24), [0, .325, -.336], [0, Math.PI / 2, 0])
  } else if (id === 'front-splitter') {
    add('chassis', plate([[-.22, .30], [-.19, .39], [-.12, .415], [.12, .415], [.19, .39], [.22, .30], [.15, .325], [-.15, .325]], .01), [0, .09, 0])
    for (const side of SIDES) box('alloy', [.006, .076, .006], [side * .14, .132, .355], [-.28, 0, side * .12])
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

export const MiniCar = memo(function MiniCar({ color, model = 'neo-falcon', scale = 1, speed = 0, speedRef, inspect = false, charge = 1, levels = STOCK_LEVELS, equipped }: {
  color: string; model?: CarModelId; scale?: number; speed?: number; speedRef?: RefObject<number>; inspect?: boolean; charge?: number; levels?: GameState['levels']; equipped?: BodyParts['equipped']
}) {
  const geometry = GEOMETRY_CACHE[model] ?? (GEOMETRY_CACHE[model] = createCarGeometry(model))
  return <group scale={scale}>
    <CarSurfaces parts={geometry.shell} color={color} model={model} inspect={inspect} />
    {!equipped?.spoiler && <CarSurfaces parts={geometry.spoiler} color={color} model={model} inspect={inspect} />}
    {!inspect && Object.values(equipped ?? {}).map(id => <AeroPart key={id} id={id} color={color} model={model} />)}
    {inspect && <CarSurfaces parts={geometry.internals} color={color} model={model} />}
    <InstalledParts levels={levels} inspect={inspect} />
    {geometry.wheels.map((wheel, index) => <RollingWheel key={index} wheel={wheel} color={color} model={model} speed={speed} speedRef={speedRef} level={levels.tires} />)}
    {inspect && Array.from({ length: 5 }, (_, index) => <mesh key={index} position={[(index - 2) * .023, .216, -.157]}>
      <boxGeometry args={[.016, .008, .018]} />
      <meshStandardMaterial color={COLORS.navy} emissive={COLORS.gold} emissiveIntensity={charge > index / 5 ? 1.8 : 0} />
    </mesh>)}
  </group>
})
