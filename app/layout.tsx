import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import '@fontsource-variable/google-sans-flex'
import './globals.css'

const description =
  'Mobil kecil, ambisi besar. Balapan mini 4WD 3D, kumpulkan koin virtual, dan rakit mobil impianmu bersama Racely.'

// Social cards need absolute image URLs. Without this the build falls back to
// http://localhost:3000 and every shared link renders a broken preview, so
// PUBLIC_APP_URL has to be present at build time (see docs/RUNBOOK.md).
function siteUrl() {
  try {
    const url = new URL(process.env.PUBLIC_APP_URL ?? '')
    return url.protocol === 'https:' ? url : undefined
  } catch {
    return undefined
  }
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: 'Racely — Night Racing Garage',
  description,
  applicationName: 'Racely',
  openGraph: {
    type: 'website',
    siteName: 'Racely',
    title: 'Racely — Night Racing Garage',
    description,
    locale: 'id_ID',
    images: [{ url: '/racely-logo.png', width: 512, height: 512, alt: 'Logo Racely: bendera balap kotak-kotak kuning dan ungu' }],
  },
  twitter: {
    card: 'summary',
    title: 'Racely — Night Racing Garage',
    description,
    images: ['/racely-logo.png'],
  },
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1, userScalable: true, themeColor: '#090c1d', colorScheme: 'dark', viewportFit: 'cover' }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" suppressHydrationWarning className="dark bg-background">
      <body className="font-sans antialiased">
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  )
}
