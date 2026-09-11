'use client'

import { memo } from 'react'
import { RoundedBox } from '@react-three/drei'

export const COLORS = { blue: '#7841ee', navy: '#090c1d', surface: '#191939', gray: '#9789cd', white: '#d9d1f4', gold: '#ffce00' }

export const MiniCar = memo(function MiniCar({ color, scale = 1 }: { color: string; scale?: number }) {
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
