'use client'

import { useLayoutEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { PMREMGenerator } from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

export function CarLighting() {
  const { gl, scene, invalidate } = useThree()
  useLayoutEffect(() => {
    const previous = scene.environment
    const intensity = scene.environmentIntensity
    const room = new RoomEnvironment()
    const generator = new PMREMGenerator(gl)
    const target = generator.fromScene(room, .04)
    scene.environment = target.texture
    scene.environmentIntensity = .7
    room.dispose()
    generator.dispose()
    invalidate()
    return () => {
      scene.environment = previous
      scene.environmentIntensity = intensity
      target.dispose()
    }
  }, [gl, scene, invalidate])
  return null
}
