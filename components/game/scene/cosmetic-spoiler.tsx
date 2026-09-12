'use client'

import { memo } from 'react'

export const CosmeticSpoiler = memo(function CosmeticSpoiler({ id }: { id: string }) {
  const twin = id === 'falcon-twin'
  const ducktail = id === 'luna-ducktail'
  const height = ducktail ? .24 : twin ? .40 : .35
  const width = ducktail ? .34 : .54
  const accent = ducktail ? '#68ffd2' : twin ? '#ff593f' : '#ffce00'
  return <group name={`cosmetic-${id}`} position={[0, 0, -.325]}>
    {[-1, 1].map(side => <group key={side}>
      <mesh position={[side * .105, (.18 + height) / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[.014, height - .18, .036]} />
        <meshStandardMaterial color="#090c1d" metalness={.65} roughness={.3} />
      </mesh>
      <mesh position={[side * width / 2, height + .012, 0]} castShadow receiveShadow>
        <boxGeometry args={[.012, twin ? .11 : .048, .12]} />
        <meshStandardMaterial color={accent} metalness={.7} roughness={.25} />
      </mesh>
    </group>)}
    <mesh position={[0, height, 0]} rotation={[ducktail ? -.3 : -.1, 0, 0]} castShadow receiveShadow>
      <boxGeometry args={[width, .018, .10]} />
      <meshPhysicalMaterial color="#191939" metalness={.5} roughness={.25} clearcoat={1} />
    </mesh>
    <mesh position={[0, height + .012, -.039]} castShadow>
      <boxGeometry args={[width, .008, .016]} />
      <meshStandardMaterial color={accent} metalness={.8} roughness={.25} />
    </mesh>
    {twin && <mesh position={[0, height - .065, .006]} castShadow receiveShadow>
      <boxGeometry args={[width, .014, .08]} />
      <meshStandardMaterial color={accent} metalness={.65} roughness={.3} />
    </mesh>}
  </group>
})
