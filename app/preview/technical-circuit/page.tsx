import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { TechnicalTrackPreview } from '@/components/game/panels/technical-track-preview'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Technical circuit prototype | Racely',
  description: 'Development-only geometry inspection. Not an active gameplay circuit.',
  robots: { index: false, follow: false },
}

export default function TechnicalCircuitPage() {
  if (process.env.NODE_ENV === 'production' || process.env.RACELY_ENABLE_PREVIEW !== 'true') notFound()
  return <TechnicalTrackPreview />
}
