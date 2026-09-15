'use client'

import { useLayoutEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { MiniCar, COLORS } from './mini-car'
import { CarLighting } from './car-lighting'
import { CAR_CATALOG } from '@/lib/car-catalog'

function FrameRenderer() {
  const { gl, scene, camera } = useThree()
  useLayoutEffect(() => {
    camera.lookAt(0, .18, 0)
    const render = (event: Event) => {
      const phase = (event as CustomEvent<number>).detail * Math.PI * 2
      const neo = scene.getObjectByName('thumbnail-neo')!
      const luna = scene.getObjectByName('thumbnail-luna')!
      neo.rotation.y = -.5 + Math.sin(phase) * .22
      luna.rotation.y = -.5 + Math.sin(phase + .4) * .22
      gl.render(scene, camera)
      gl.domElement.dataset.ready = 'true'
    }
    window.addEventListener('thumbnail-frame', render)
    render(new CustomEvent('thumbnail-frame', { detail: 0 }))
    return () => window.removeEventListener('thumbnail-frame', render)
  }, [gl, scene, camera])
  return null
}

export default function StartThumbnailScene() {
  return <Canvas
    orthographic
    camera={{ position: [0, 2.5, 4], zoom: 250, near: .1, far: 30 }}
    dpr={1}
    gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
    frameloop="never"
    aria-label="Neo Falcon et Luna GT, modèles originaux Racely"
  >
    <CarLighting />
    <ambientLight intensity={.45} />
    <hemisphereLight args={[COLORS.white, COLORS.navy, .75]} />
    <directionalLight position={[2, 5, 3]} intensity={2.5} />
    <directionalLight position={[-3, 2, -2]} intensity={1.2} color={COLORS.white} />
    <group name="thumbnail-luna" position={[-.66, -.02, -.13]} rotation={[0, -.5, 0]}>
      <MiniCar model="luna-gt" color={CAR_CATALOG['luna-gt'].defaultColor} />
    </group>
    <group name="thumbnail-neo" position={[.63, 0, .05]} rotation={[0, -.5, 0]}>
      <MiniCar model="neo-falcon" color={CAR_CATALOG['neo-falcon'].defaultColor} />
    </group>
    <FrameRenderer />
  </Canvas>
}
