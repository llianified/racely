import { notFound } from 'next/navigation'
import { ThumbnailCapture } from './thumbnail-capture'

export const dynamic = 'force-dynamic'

export default function Page() {
  if (process.env.NODE_ENV === 'production' || process.env.RACELY_ENABLE_PREVIEW !== 'true') notFound()
  return <ThumbnailCapture />
}
