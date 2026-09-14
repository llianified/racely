import { advanceTrackPose, primitiveLength, type TrackPose, type TrackPrimitive } from './track-layout'

type PathSection = { readonly id: string; readonly geometry: readonly TrackPrimitive[] }
type DistanceMode = 'centerline' | 'lane'

/** Visual sampling only. Positive offsets are left of travel (outward on a clockwise loop). */
export function createTrackPath(sections: readonly PathSection[], start: TrackPose = { x: 0, z: 0, heading: 0 }) {
  let cursor = start
  let distance = 0
  const spans = sections.flatMap(section => section.geometry.map(primitive => {
    const length = primitiveLength(primitive)
    const span = { primitive, sectionId: section.id, start: cursor, distance, length }
    cursor = advanceTrackPose(cursor, primitive, 1)
    distance += length
    return span
  }))
  const totalLength = distance
  const lanes = new Map<number, { lengths: number[]; totalLength: number }>()

  function lane(offset: number) {
    const cached = lanes.get(offset)
    if (cached) return cached
    if (!Number.isFinite(offset)) throw new RangeError('Track offset must be finite')
    const lengths = spans.map(({ primitive, length }) => {
      if (primitive.kind === 'line') return length
      const radius = primitive.radius + Math.sign(primitive.turn) * offset
      if (radius <= 0) throw new RangeError('Track offset would fold an arc')
      return radius * Math.abs(primitive.turn)
    })
    const profile = { lengths, totalLength: lengths.reduce((sum, length) => sum + length, 0) }
    lanes.set(offset, profile)
    return profile
  }

  function offsetPose(pose: TrackPose, offset: number) {
    return { x: pose.x + Math.sin(pose.heading) * offset, z: pose.z - Math.cos(pose.heading) * offset, heading: pose.heading }
  }

  function point(progress: number, offset = 0, mode: DistanceMode = 'lane', wrap = true) {
    const value = Number.isFinite(progress) ? progress : 0
    const fraction = wrap ? ((value % 1) + 1) % 1 : Math.min(1, Math.max(0, value))
    const profile = lane(offset)
    let remaining = fraction * (mode === 'lane' ? profile.totalLength : totalLength)
    for (let index = 0; index < spans.length; index++) {
      const span = spans[index]
      const length = mode === 'lane' ? profile.lengths[index] : span.length
      if (remaining < length || index === spans.length - 1) {
        const pose = advanceTrackPose(span.start, span.primitive, length > 0 ? remaining / length : 0)
        return { ...offsetPose(pose, offset), sectionId: span.sectionId, angle: Math.PI / 2 - pose.heading }
      }
      remaining -= length
    }
    throw new RangeError('Track path must contain geometry')
  }

  function bounds(offset: number) {
    lane(offset)
    const points = spans.flatMap(span => {
      const fractions = [0, 1]
      if (span.primitive.kind === 'arc' && span.primitive.turn !== 0) {
        const end = span.start.heading + span.primitive.turn
        const lower = Math.min(span.start.heading, end)
        const upper = Math.max(span.start.heading, end)
        for (let quadrant = Math.ceil(lower / (Math.PI / 2)); quadrant * Math.PI / 2 <= upper; quadrant++) {
          fractions.push((quadrant * Math.PI / 2 - span.start.heading) / span.primitive.turn)
        }
      }
      return fractions.map(fraction => offsetPose(advanceTrackPose(span.start, span.primitive, fraction), offset))
    })
    return {
      minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)),
      minZ: Math.min(...points.map(p => p.z)), maxZ: Math.max(...points.map(p => p.z)),
    }
  }

  return { spans, totalLength, point, laneLength: (offset: number) => lane(offset).totalLength, bounds }
}
