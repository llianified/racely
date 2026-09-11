import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import '@fontsource-variable/google-sans-flex'
import './globals.css'

export const metadata: Metadata = {
  title: 'Racely — Night Racing Garage',
  description: 'Mobil kecil, ambisi besar. Balapan mini 4WD 3D, kumpulkan koin virtual, dan rakit mobil impianmu bersama Racely.',
  applicationName: 'Racely',
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, themeColor: '#090c1d', colorScheme: 'dark', viewportFit: 'cover' }

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
