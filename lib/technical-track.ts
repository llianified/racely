/**
 * Candidate only: not a GameState.circuit ID or an authoritative race model.
 * Coordinates are scene units in X/Z, heading 0 is +X; positive radians turn
 * right toward +Z. Primitives inherit the previous endpoint and tangent.
 * lengthFraction is CENTERLINE distance, never elapsed time or lane distance.
 * severity is deliberately null until server calibration; do not infer rewards,
 * grip, boost windows, or settlement from this visual contract.
 */
export type TrackPrimitive =
  | { readonly kind: 'line'; readonly length: number }
  | { readonly kind: 'arc'; readonly radius: number; readonly turn: number }

export type TrackSection = {
  readonly id: string
  readonly kind: 'straight' | 'corner' | 's-curve' | 'hairpin'
  readonly label: string
  readonly geometry: readonly TrackPrimitive[]
  readonly lengthFraction: number
  readonly severity: null
}

export type TrackPose = { x: number; z: number; heading: number }

const definitions = [
  { id: 'launch', kind: 'straight', label: 'Straight', geometry: [{ kind: 'line', length: 5 }] },
  { id: 'technical', kind: 'corner', label: 'Technical corner', geometry: [{ kind: 'arc', radius: 3.4, turn: Math.PI }] },
  { id: 's-curve', kind: 's-curve', label: 'S-curve', geometry: [
    { kind: 'arc', radius: 4, turn: Math.PI / 3 },
    { kind: 'arc', radius: 4, turn: -Math.PI / 3 },
  ] },
  { id: 'hairpin', kind: 'hairpin', label: 'Hairpin', geometry: [{ kind: 'arc', radius: 1.4, turn: Math.PI }] },
  // The S displaces X by -8 sin(60°); this straight closes position AND tangent.
  { id: 'return', kind: 'straight', label: 'Finish straight', geometry: [{ kind: 'line', length: 8 * Math.sin(Math.PI / 3) - 5 }] },
] as const satisfies readonly Omit<TrackSection, 'lengthFraction' | 'severity'>[]

export function primitiveLength(primitive: TrackPrimitive) {
  return primitive.kind === 'line' ? primitive.length : primitive.radius * Math.abs(primitive.turn)
}

const sectionLengths = definitions.map(section => section.geometry.reduce((sum, primitive) => sum + primitiveLength(primitive), 0))
const totalLength = sectionLengths.reduce((sum, length) => sum + length, 0)

export const TECHNICAL_TRACK = {
  id: 'technical-prototype',
  status: 'visual-only',
  closed: true,
  start: { x: 0, z: 0, heading: 0 },
  laneWidth: .46,
  laneOffsets: [-.46, 0, .46],
  totalLength,
  sections: definitions.map((section, index): TrackSection => ({
    ...section, lengthFraction: sectionLengths[index] / totalLength, severity: null,
  })),
} as const

export function advanceTrackPose(start: TrackPose, primitive: TrackPrimitive, fraction: number): TrackPose {
  const t = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0))
  if (primitive.kind === 'line') return {
    x: start.x + Math.cos(start.heading) * primitive.length * t,
    z: start.z + Math.sin(start.heading) * primitive.length * t,
    heading: start.heading,
  }
  const heading = start.heading + primitive.turn * t
  const signedRadius = Math.sign(primitive.turn) * primitive.radius
  return {
    x: start.x + signedRadius * (Math.sin(heading) - Math.sin(start.heading)),
    z: start.z - signedRadius * (Math.cos(heading) - Math.cos(start.heading)),
    heading,
  }
}

let cursor: TrackPose = TECHNICAL_TRACK.start
let distance = 0
const spans = TECHNICAL_TRACK.sections.flatMap(section => section.geometry.map(primitive => {
  const length = primitiveLength(primitive)
  const span = { primitive, sectionId: section.id, start: cursor, distance, length }
  cursor = advanceTrackPose(cursor, primitive, 1)
  distance += length
  return span
}))

/** Clamped inspection progress, not a clock. Positive offset is right of travel. */
export function technicalTrackPoint(progress: number, laneOffset = 0) {
  const d = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0)) * totalLength
  const span = spans.find(span => d < span.distance + span.length) ?? spans[spans.length - 1]
  const pose = advanceTrackPose(span.start, span.primitive, (d - span.distance) / span.length)
  return {
    x: pose.x - Math.sin(pose.heading) * laneOffset,
    z: pose.z + Math.cos(pose.heading) * laneOffset,
    heading: pose.heading,
    sectionId: span.sectionId,
  }
}

// Include every primitive boundary exactly: no spline rounding or hidden joins.
export const TECHNICAL_TRACK_SAMPLES = [0, ...spans.flatMap(span => {
  const steps = Math.ceil(span.length / .08)
  return Array.from({ length: steps }, (_, index) => (span.distance + span.length * (index + 1) / steps) / totalLength)
})]
