import * as THREE from 'three'
import type { CarModelId } from '@/lib/car-catalog'

export type Finish = 'body' | 'panel' | 'chassis' | 'rubber' | 'alloy' | 'gold' | 'livery' | 'glass'
type Position = [number, number, number]
type Station = [z: number, width: number, base: number, shoulder: number, crown: number, offset?: number]
export type AddCarPart = (finish: Finish, geometry: THREE.BufferGeometry, position?: Position, rotation?: Position) => void
const SIDES = [-1, 1] as const

// Hard normals preserve the creases of a molded racing shell instead of smoothing it into a capsule.
export function facetedHull(stations: Station[]) {
  const vertices: number[] = []
  const indices: number[] = []
  for (const [z, width, base, shoulder, crown, x = 0] of stations) {
    for (const [dx, y] of [[-width, base], [-width, shoulder], [-width * .52, crown], [width * .52, crown], [width, shoulder], [width, base]]) {
      vertices.push(x + dx, y, z)
    }
  }
  for (let station = 0; station < stations.length - 1; station++) {
    for (let edge = 0; edge < 6; edge++) {
      const a = station * 6 + edge
      const b = station * 6 + (edge + 1) % 6
      indices.push(a, a + 6, b, a + 6, b + 6, b)
    }
  }
  const last = (stations.length - 1) * 6
  for (let i = 1; i < 5; i++) indices.push(0, i, i + 1, last, last + i + 1, last + i)
  const indexed = new THREE.BufferGeometry()
  indexed.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  indexed.setIndex(indices)
  const geometry = indexed.toNonIndexed()
  indexed.dispose()
  geometry.computeVertexNormals()
  return geometry
}

function graphic(points: Position[]) {
  const vertices = points.flat()
  const indices: number[] = []
  const normal = new THREE.Vector3().crossVectors(
    new THREE.Vector3(...points[1]).sub(new THREE.Vector3(...points[0])),
    new THREE.Vector3(...points[2]).sub(new THREE.Vector3(...points[0])),
  )
  for (let i = 1; i < points.length - 1; i++) {
    indices.push(...(normal.y < 0 ? [0, i + 1, i] : [0, i, i + 1]))
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function falconBody(add: AddCarPart) {
  add('panel', facetedHull([
    [-.32, .079, .13, .177, .195], [-.19, .109, .133, .211, .236],
    [-.065, .104, .135, .214, .246], [.12, .091, .13, .192, .219],
    [.28, .071, .127, .15, .176], [.385, .041, .126, .139, .147],
  ]))
  add('glass', facetedHull([
    [-.215, .032, .226, .233, .237], [-.14, .063, .24, .268, .29],
    [-.035, .055, .242, .266, .286], [.10, .032, .221, .23, .239],
    [.16, .005, .202, .204, .208],
  ]))
  add('body', facetedHull([
    [.105, .032, .216, .22, .225], [.235, .044, .184, .188, .193],
    [.35, .014, .151, .154, .158], [.386, .002, .146, .148, .15],
  ]))
  for (const side of SIDES) {
    add('panel', facetedHull([
      [-.33, .009, .135, .18, .198, side * .137],
      [-.205, .033, .137, .234, .247, side * .151],
      [-.09, .046, .126, .211, .225, side * .161],
      [.055, .035, .12, .172, .187, side * .168],
      [.18, .009, .122, .139, .147, side * .139],
    ]))
    add('body', facetedHull([
      [-.315, .007, .179, .194, .201, side * .145],
      [-.205, .014, .226, .245, .253, side * .173],
      [-.065, .012, .181, .201, .214, side * .193],
      [.09, .003, .135, .14, .148, side * .181],
    ]))
    add('body', facetedHull([
      [-.165, .027, .098, .109, .116, side * .178],
      [.08, .026, .098, .111, .119, side * .176],
      [.24, .009, .103, .11, .117, side * .145],
    ]))
    add('livery', graphic([
      [side * .179, .248, -.221], [side * .189, .222, -.128],
      [side * .203, .181, -.012], [side * .184, .205, -.065],
    ]))
    add('livery', graphic([
      [side * .032, .186, .252], [side * .053, .178, .274],
      [side * .024, .156, .354], [side * .014, .159, .338],
    ]))
    add('livery', graphic([
      [side * .067, .247, -.143], [side * .074, .247, -.122],
      [side * .043, .226, .075], [side * .038, .227, .084],
    ]))
    add('panel', facetedHull([
      [-.13, .02, .145, .164, .174, side * .207],
      [-.015, .019, .131, .151, .163, side * .205],
      [.062, .011, .121, .137, .148, side * .19],
    ]))
    for (let vent = 0; vent < 4; vent++) {
      add('chassis', new THREE.BoxGeometry(.035, .005, .009),
        [side * .14, .235 - vent * .008, -.139 + vent * .023], [-.31, side * .14, side * -.23])
    }
    add('alloy', new THREE.CylinderGeometry(.006, .006, .004, 12), [side * .063, .19, .224])
  }
  add('body', facetedHull([
    [-.31, .008, .198, .213, .218], [-.22, .012, .237, .272, .285],
    [-.12, .007, .285, .294, .30], [-.075, .002, .29, .296, .299],
  ]))
}

function lunaBody(add: AddCarPart) {
  add('body', facetedHull([
    [-.348, .102, .127, .161, .176], [-.23, .157, .124, .188, .208],
    [-.105, .148, .122, .18, .212], [.08, .14, .121, .17, .205],
    [.245, .146, .12, .158, .18], [.375, .105, .119, .139, .152],
  ]))
  add('glass', facetedHull([
    [-.232, .086, .195, .202, .219], [-.125, .10, .21, .265, .29],
    [-.018, .091, .206, .269, .296], [.133, .077, .183, .201, .219],
  ]))
  add('body', facetedHull([
    [-.13, .057, .289, .294, .298], [-.035, .052, .295, .301, .305],
    [-.015, .047, .295, .298, .301],
  ]))
  add('panel', facetedHull([
    [.147, .09, .181, .194, .20], [.27, .071, .17, .18, .187],
    [.371, .055, .15, .156, .16],
  ]))
  for (const side of SIDES) {
    add('body', facetedHull([
      [-.328, .011, .129, .165, .179, side * .139],
      [-.267, .034, .131, .184, .208, side * .162],
      [-.182, .033, .124, .173, .195, side * .162],
      [-.11, .011, .118, .14, .157, side * .154],
    ]))
    add('body', facetedHull([
      [.12, .012, .12, .143, .159, side * .153],
      [.213, .032, .123, .171, .194, side * .165],
      [.284, .029, .124, .166, .186, side * .163],
      [.351, .011, .12, .145, .157, side * .126],
    ]))
    add('panel', facetedHull([
      [-.16, .018, .095, .11, .116, side * .184],
      [.14, .018, .095, .109, .115, side * .181],
      [.21, .007, .101, .107, .11, side * .155],
    ]))
    add('livery', graphic([
      [side * .022, .203, .147], [side * .037, .203, .147],
      [side * .024, .164, .369], [side * .012, .164, .369],
    ]))
    add('livery', graphic([
      [side * .094, .172, .296], [side * .125, .165, .307],
      [side * .104, .155, .35], [side * .082, .158, .34],
    ]))
    add('panel', facetedHull([
      [-.091, .014, .136, .155, .174, side * .152],
      [.038, .011, .13, .144, .158, side * .15],
      [.094, .004, .127, .133, .137, side * .142],
    ]))
    for (let vent = 0; vent < 3; vent++) {
      add('chassis', new THREE.BoxGeometry(.032, .004, .009), [side * .112, .198, -.213 + vent * .018], [0, side * .2, side * -.2])
    }
    add('livery', new THREE.BoxGeometry(.054, .009, .003), [side * .071, .153, -.351])
  }
  add('chassis', new THREE.BoxGeometry(.136, .017, .01), [0, .13, .371])
  for (let fin = -2; fin <= 2; fin++) {
    add('panel', new THREE.BoxGeometry(.006, .026, .07), [fin * .032, .104, -.326])
  }
}

export function addBodywork(model: CarModelId, add: AddCarPart) {
  if (model === 'neo-falcon') falconBody(add)
  else lunaBody(add)
}

export function addStockWing(model: CarModelId, add: AddCarPart) {
  const falcon = model === 'neo-falcon'
  const span = falcon ? .233 : .211
  const height = falcon ? .303 : .284
  for (const side of SIDES) {
    add('panel', facetedHull([
      [-.333, .008, .179, height - .02, height, side * .11],
      [-.295, .008, .184, height - .012, height, side * .11],
    ]))
    add('body', facetedHull([
      [-.385, .006, height - .008, height + .026, height + .03, side * span],
      [-.345, .007, height - .016, height + .038, height + .045, side * span],
      [-.284, .005, height - .01, height + .01, height + .013, side * span],
    ]))
    add('livery', new THREE.BoxGeometry(.021, .002, .068), [side * (span - .025), height + .012, -.34], [-.05, 0, 0])
    add('alloy', new THREE.CylinderGeometry(.005, .005, .005, 12), [side * .11, height + .014, -.32])
  }
  add(falcon ? 'panel' : 'body', facetedHull([
    [-.385, span, height - .004, height, height + .004],
    [-.35, span, height - .006, height + .004, height + .013],
    [-.288, span * .92, height - .005, height, height + .009],
  ]))
  add('livery', new THREE.BoxGeometry(span * 1.35, .002, .006), [0, height + .006, -.376])
}
