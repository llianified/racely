'use client'

import dynamic from 'next/dynamic'

const Scene = dynamic(() => import('@/components/game/scene/start-thumbnail-scene'), { ssr: false })

export function ThumbnailCapture() {
  return <main style={{ width: 800, height: 450, overflow: 'hidden', position: 'relative', background: 'var(--background)', fontFamily: '"Google Sans Flex Variable", sans-serif', color: 'var(--foreground)' }}>
    <div style={{ position: 'absolute', inset: '90px -120px -180px', borderRadius: '50%', background: 'radial-gradient(ellipse, #7841ee40, #7841ee00 68%)' }} />
    <header style={{ position: 'absolute', left: 38, right: 38, top: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/racely-logo.png" width={44} height={30} alt="" />
        <span style={{ fontSize: 25, fontWeight: 1000, letterSpacing: '-.05em' }}>RACELY<span style={{ color: 'var(--accent)' }}>.</span></span>
      </div>
      <span style={{ fontSize: 11, letterSpacing: '.2em', fontWeight: 650, color: 'var(--muted-foreground)' }}>MINI 4WD · MAXIMUM FUN</span>
    </header>
    <h1 style={{ position: 'absolute', left: 38, top: 80, fontWeight: 950, fontSize: 43, letterSpacing: '-.045em', lineHeight: 1.15 }}>Mesin siap. <span style={{ color: 'var(--accent)' }}>Giliranmu.</span></h1>
    <div style={{ position: 'absolute', inset: '148px 0 46px' }}><Scene /></div>
    <footer style={{ position: 'absolute', left: 38, right: 38, bottom: 26, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 15 }}>
      <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Pilih mobil. Bangun jagoanmu. Kuasai lintasan.</span>
      <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 750 }}>BALAPAN MULAI DI SINI</span>
    </footer>
  </main>
}
