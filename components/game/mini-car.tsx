'use client'

import { memo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export const COLORS = { blue: '#7841ee', navy: '#090c1d', surface: '#191939', gray: '#9789cd', white: '#d9d1f4', gold: '#ffce00' }

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

function createCarGeometry() {
  const parts: Record<Finish, THREE.BufferGeometry[]> = {
    body: [], chassis: [], rubber: [], alloy: [], gold: [], livery: [], glass: [],
  }
  const add = (finish: Finish, geometry: THREE.BufferGeometry, position: Position = [0, 0, 0], rotation: Position = [0, 0, 0]) => {
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation)))
    geometry.translate(...position)
    const triangles = geometry.index ? geometry.toNonIndexed() : geometry
    if (triangles !== geometry) geometry.dispose()
    for (const name of Object.keys(triangles.attributes)) {
      if (name !== 'position' && name !== 'normal') triangles.deleteAttribute(name)
    }
    parts[finish].push(triangles)
  }
  const cylinder = (radius: number, height: number, segments = 32) => new THREE.CylinderGeometry(radius, radius, height, segments)
  const ring = (radius: number, tube: number) => new THREE.TorusGeometry(radius, tube, 8, 48)

  add('chassis', plate([
    [-.115, -.36], [-.184, -.29], [-.184, -.20], [-.145, -.14],
    [-.145, .15], [-.184, .21], [-.184, .30], [-.095, .385],
    [.095, .385], [.184, .30], [.184, .21], [.145, .15],
    [.145, -.14], [.184, -.20], [.184, -.29], [.115, -.36],
  ], .035), [0, .082, 0])

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
    add('gold', sculptedShell([
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

  for (const z of AXLES) {
    add('alloy', cylinder(.010, .565, 16), [0, .124, z], [0, 0, Math.PI / 2])
    for (const side of SIDES) {
      const x = side * .255
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
        add('body', spokeGeometry, [faceX, .124, z])
      }
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

  return Object.fromEntries(Object.entries(parts).map(([finish, geometries]) => {
    const merged = mergeGeometries(geometries)!
    geometries.forEach(geometry => geometry.dispose())
    merged.computeBoundingSphere()
    return [finish, merged]
  })) as Record<Finish, THREE.BufferGeometry>
}

// Both canvases share immutable geometry; batch details by finish instead of drawing each bolt separately.
const CAR_GEOMETRY = createCarGeometry()

export const MiniCar = memo(function MiniCar({ color, scale = 1 }: { color: string; scale?: number }) {
  return <group scale={scale}>
    <mesh geometry={CAR_GEOMETRY.body} dispose={null} castShadow receiveShadow>
      <meshPhysicalMaterial color={color} roughness={.27} metalness={.16} clearcoat={.85} clearcoatRoughness={.19} />
    </mesh>
    <mesh geometry={CAR_GEOMETRY.chassis} dispose={null} castShadow receiveShadow>
      <meshStandardMaterial color={COLORS.navy} roughness={.54} metalness={.18} />
    </mesh>
    <mesh geometry={CAR_GEOMETRY.rubber} dispose={null} castShadow receiveShadow>
      <meshStandardMaterial color={COLORS.navy} roughness={.94} />
    </mesh>
    <mesh geometry={CAR_GEOMETRY.alloy} dispose={null} castShadow>
      <meshStandardMaterial color={COLORS.white} roughness={.29} metalness={.72} />
    </mesh>
    <mesh geometry={CAR_GEOMETRY.gold} dispose={null} castShadow>
      <meshStandardMaterial color={COLORS.gold} roughness={.28} metalness={.65} />
    </mesh>
    <mesh geometry={CAR_GEOMETRY.livery} dispose={null}>
      <meshStandardMaterial color={COLORS.white} roughness={.36} metalness={.08} />
    </mesh>
    <mesh geometry={CAR_GEOMETRY.glass} dispose={null} castShadow>
      <meshPhysicalMaterial color={COLORS.navy} roughness={.13} metalness={.25} clearcoat={1} clearcoatRoughness={.08} />
    </mesh>
  </group>
})
