import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import '@fontsource-variable/google-sans-flex'
import './globals.css'

const description =
  'Mobil lucu, kelakuan random. Balapan mini 4WD 3D, kumpulkan koin virtual, dan koleksi Mochi Meong, Bebek Sultan, Burger Oleng, serta UFO Gabut di Racely.'

// Social cards need absolute image URLs. Without this the build falls back to
// http://localhost:3000 and every shared link renders a broken preview, so
// PUBLIC_APP_URL has to be present at build time.
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
  title: 'Racely — Lucu Dulu, Ngebut Kemudian',
  description,
  applicationName: 'Racely',
  openGraph: {
    type: 'website',
    siteName: 'Racely',
    title: 'Racely — Lucu Dulu, Ngebut Kemudian',
    description,
    locale: 'id_ID',
    images: [{ url: '/racely-logo.png', width: 512, height: 512, alt: 'Logo Racely: bendera balap kotak-kotak kuning dan ungu' }],
  },
  twitter: {
    card: 'summary',
    title: 'Racely — Lucu Dulu, Ngebut Kemudian',
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
