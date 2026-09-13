import * as THREE from 'three'
import type { CarModelId } from '@/lib/car-catalog'

export type PlayfulFinish = 'body' | 'livery' | 'rubber' | 'gold' | 'candy' | 'mint' | 'snack' | 'orange' | 'dome'
type Vec3 = [number, number, number]
type AddPart = (finish: PlayfulFinish, geometry: THREE.BufferGeometry, position?: Vec3, rotation?: Vec3) => void

export function addPlayfulBody(model: CarModelId, add: AddPart) {
  const oval = (finish: PlayfulFinish, size: Vec3, position: Vec3, rotation?: Vec3) => {
    const shape = new THREE.SphereGeometry(1, 24, 16)
    shape.scale(...size)
    add(finish, shape, position, rotation)
  }
  const ring = (finish: PlayfulFinish, radius: number, tube: number, position: Vec3, rotation: Vec3 = [Math.PI / 2, 0, 0]) => {
    add(finish, new THREE.TorusGeometry(radius, tube, 10, 40), position, rotation)
  }
  const face = (y: number, z: number, width = .078) => {
    for (const side of [-1, 1]) {
      oval('livery', [.048, .057, .018], [side * width, y, z])
      oval('rubber', [.022, .033, .012], [side * width, y - .003, z + .018])
      oval('livery', [.007, .01, .005], [side * width - .007, y + .012, z + .029])
      oval('candy', [.029, .013, .009], [side * (width + .039), y - .052, z - .006])
    }
    add('rubber', new THREE.TorusGeometry(.024, .006, 6, 18, Math.PI), [0, y - .056, z + .02], [0, 0, Math.PI])
  }

  if (model === 'neo-falcon') {
    oval('body', [.218, .176, .335], [0, .289, -.006])
    oval('livery', [.12, .09, .03], [0, .254, .294])
    for (const side of [-1, 1]) {
      add('body', new THREE.ConeGeometry(.081, .157, 3), [side * .139, .469, .064], [0, Math.PI, side * -.16])
      add('candy', new THREE.ConeGeometry(.046, .102, 3), [side * .139, .474, .096], [0, Math.PI, side * -.16])
      oval('body', [.056, .048, .073], [side * .172, .205, .205])
      for (const offset of [-1, 1]) {
        add('rubber', new THREE.CapsuleGeometry(.004, .048, 3, 6), [side * .153, .30 + offset * .018, .27], [0, 0, side * (Math.PI / 2 + offset * .16)])
      }
    }
    face(.337, .281)
    oval('candy', [.016, .011, .01], [0, .294, .326])
    ring('body', .083, .031, [0, .322, -.302], [0, Math.PI / 2, 0])
  } else if (model === 'luna-gt') {
    add('body', new THREE.CylinderGeometry(.155, .222, .226, 32), [0, .308, 0])
    oval('body', [.222, .058, .257], [0, .205, 0])
    oval('snack', [.161, .045, .17], [0, .426, 0])
    for (const side of [-1, 1]) oval('snack', [.032, .052, .023], [side * .103, .408, .114])
    oval('livery', [.067, .027, .07], [0, .461, 0])
    oval('candy', [.037, .037, .037], [0, .506, 0])
    add('mint', new THREE.CapsuleGeometry(.006, .028, 3, 6), [.01, .549, 0], [0, 0, -.35])
    face(.326, .186, .065)
  } else if (model === 'bebek-sultan') {
    ring('candy', .206, .041, [0, .248, -.043])
    oval('body', [.18, .17, .285], [0, .31, -.043])
    oval('body', [.143, .143, .14], [0, .44, .133])
    for (const side of [-1, 1]) {
      oval('body', [.055, .073, .153], [side * .169, .347, -.081], [side * .3, 0, side * -.3])
      oval('rubber', [.015, .023, .01], [side * .067, .467, .26])
      oval('livery', [.005, .007, .005], [side * .067 - .004, .475, .269])
      oval('candy', [.026, .012, .009], [side * .087, .431, .254])
    }
    oval('orange', [.096, .026, .071], [0, .413, .285])
    oval('orange', [.078, .016, .061], [0, .389, .28])
    ring('gold', .066, .013, [0, .577, .104])
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5
      const x = Math.cos(angle) * .054
      const z = .104 + Math.sin(angle) * .054
      add('gold', new THREE.ConeGeometry(.025, .066, 4), [x, .603, z])
      oval('candy', [.01, .01, .01], [x, .638, z])
    }
    oval('body', [.071, .053, .077], [0, .405, -.266], [-.4, 0, 0])
  } else if (model === 'burger-oleng') {
    oval('body', [.224, .061, .264], [0, .211, 0])
    for (const y of [.267, .351]) {
      oval('snack', [.223, .031, .265], [0, y, 0])
      add('gold', new THREE.BoxGeometry(.34, .014, .38), [0, y + .03, 0], [0, .23, 0])
    }
    for (let i = 0; i < 12; i++) {
      const angle = i / 12 * Math.PI * 2
      oval('mint', [.066, .026, .064], [Math.cos(angle) * .181, .311, Math.sin(angle) * .224])
    }
    oval('candy', [.216, .018, .248], [0, .403, 0])
    oval('body', [.231, .122, .269], [0, .43, 0])
    for (const [x, z] of [[-.1, -.12], [.07, -.14], [-.14, .02], [0, 0], [.12, .03], [-.05, .13], [.07, .16]]) {
      const y = .43 + .122 * Math.sqrt(1 - (x / .231) ** 2 - (z / .269) ** 2)
      oval('livery', [.009, .005, .022], [x, y + .003, z], [0, x * 8, 0])
    }
    face(.45, .245)
    oval('candy', [.018, .025, .008], [.01, .38, .267])
  } else {
    oval('body', [.268, .067, .292], [0, .286, 0])
    ring('gold', .25, .013, [0, .29, 0])
    oval('body', [.185, .065, .213], [0, .228, 0])
    oval('mint', [.1, .11, .09], [0, .411, .02])
    for (const side of [-1, 1]) {
      oval('rubber', [.025, .043, .012], [side * .042, .431, .097], [0, 0, side * -.3])
      oval('livery', [.008, .011, .006], [side * .042 - .008, .443, .107])
      add('mint', new THREE.CapsuleGeometry(.007, .044, 3, 6), [side * .051, .514, .015], [0, 0, side * -.4])
      oval('candy', [.016, .016, .016], [side * .065, .546, .015])
    }
    add('rubber', new THREE.TorusGeometry(.02, .005, 6, 14, Math.PI), [0, .387, .11], [0, 0, Math.PI])
    ring('livery', .16, .012, [0, .333, 0])
    oval('dome', [.168, .244, .168], [0, .333, 0])
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * Math.PI * 2
      oval(i % 2 ? 'candy' : 'mint', [.018, .015, .018], [Math.cos(angle) * .255, .308, Math.sin(angle) * .275])
    }
    for (const side of [-1, 1]) oval('gold', [.036, .034, .067], [side * .109, .211, -.217])
  }
}
