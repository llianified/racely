'use client'

import type { CSSProperties } from 'react'

/**
 * Jaring terakhir: `app/error.tsx` hanya menangkap lemparan DI DALAM layout
 * root. Kalau layout-nya sendiri yang gagal, hanya berkas ini yang tersisa --
 * dan ia mengganti seluruh dokumen, jadi ia harus membawa <html> dan <body>
 * sendiri.
 *
 * Gayanya ditulis inline, bukan lewat globals.css: kalau yang gagal justru
 * pemuatan layout, tidak ada jaminan lembar gaya itu ikut terpasang, dan
 * halaman darurat yang tampil sebagai teks hitam di atas hitam sama tidak
 * berartinya dengan halaman putih yang ia gantikan.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const actionStyle: CSSProperties = {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 'var(--space-48, 48px)',
    padding: 'var(--space-md, 12px) var(--space-lg, 16px)',
    borderRadius: 'var(--corner-box, 6px)',
    font: 'inherit',
    fontSize: 'var(--fs-read, 14px)',
    fontWeight: 700,
    lineHeight: 1.5,
    textDecoration: 'none',
    textAlign: 'center',
    cursor: 'pointer',
  }

  return (
    <html lang="id">
      <body
        style={{
          boxSizing: 'border-box',
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: 'calc(var(--space-xl, 24px) + var(--safe-top, env(safe-area-inset-top, 0px))) calc(var(--space-lg, 16px) + var(--safe-right, env(safe-area-inset-right, 0px))) calc(var(--space-xl, 24px) + var(--safe-bottom, env(safe-area-inset-bottom, 0px))) calc(var(--space-lg, 16px) + var(--safe-left, env(safe-area-inset-left, 0px)))',
          background: 'var(--background, #090c1d)',
          color: 'var(--foreground, #f9f8ff)',
          fontFamily: 'system-ui, sans-serif',
          colorScheme: 'dark',
        }}
      >
        <main style={{ width: '100%', maxWidth: 'var(--app-width, 480px)', marginBlock: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-xl, 24px)' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-lg, 16px)' }}>
            <span style={{ fontSize: 'var(--fs-4xl, 24px)', fontWeight: 900, letterSpacing: '-.05em' }}>RACELY<span style={{ color: 'var(--accent, #ffce00)' }} aria-hidden="true">.</span></span>
            <span style={{ fontSize: 'var(--fs-nano, 10px)', letterSpacing: '.08em', color: 'var(--muted-foreground, #b2a5d9)' }}>MINI APP TELEGRAM</span>
          </header>
          <section aria-labelledby="global-error-title" style={{ overflow: 'hidden', border: '1px solid var(--border, #7b6cb92e)', borderRadius: 'var(--corner-box, 6px)', background: 'var(--card, #1a1939)' }}>
            <p style={{ margin: 0, padding: 'var(--space-lg, 16px) var(--space-20, 20px)', borderBottom: '1px solid var(--border, #7b6cb92e)', color: 'var(--accent, #ffce00)', fontSize: 'var(--fs-nano, 10px)', fontWeight: 700, letterSpacing: '.1em' }}>JEDA TEKNIS / PEMULIHAN</p>
            <div style={{ padding: 'var(--space-20, 20px)', display: 'flex', flexDirection: 'column', gap: 'var(--space-lg, 16px)' }}>
              <h1 id="global-error-title" style={{ margin: 0, fontSize: 'var(--fs-6xl, 30px)', fontWeight: 900, letterSpacing: '-.05em', lineHeight: 1.12 }}>
                Racely perlu<br /><span style={{ color: 'var(--accent, #ffce00)' }}>dimuat ulang.</span>
              </h1>
              <p style={{ margin: 0, fontSize: 'var(--fs-read, 14px)', lineHeight: 1.6, color: 'var(--muted-foreground, #b2a5d9)' }}>
                Ada kendala saat membuka game. Progres yang tersimpan di server tetap terhubung ke akunmu.
              </p>
              {/* Alasan yang sama dengan app/error.tsx: di dalam WebView Telegram
                  tidak ada console yang bisa dibuka pemain. */}
              <details style={{ fontSize: 'var(--fs-small, 12px)', lineHeight: 1.5, color: 'var(--muted-foreground, #b2a5d9)' }}>
                <summary style={{ cursor: 'pointer', paddingBlock: 'var(--space-sm, 8px)' }}>Detail teknis</summary>
                <p style={{ margin: 'var(--space-sm, 8px) 0 0', overflowWrap: 'anywhere' }}>{error.name}: {error.message}</p>
                {error.digest && <p style={{ margin: 'var(--space-sm, 8px) 0 0', overflowWrap: 'anywhere' }}>Kode: {error.digest}</p>}
              </details>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm, 8px)', padding: 'var(--space-20, 20px)', borderTop: '1px dashed var(--border, #7b6cb92e)', background: 'var(--surface-inset, #161630)' }}>
              <button type="button" onClick={reset} style={{ ...actionStyle, border: 0, background: 'var(--accent, #ffce00)', color: 'var(--accent-foreground, #261900)' }}>
                Muat ulang Racely
              </button>
              <a href="https://t.me/RacelyBot?startapp=play" style={{ ...actionStyle, border: '1px solid var(--border, #7b6cb92e)', background: 'var(--background, #090c1d)', color: 'var(--foreground, #f9f8ff)' }}>
                Buka ulang dari @RacelyBot
              </a>
              <p style={{ margin: 'var(--space-xs, 4px) 0 0', textAlign: 'center', fontSize: 'var(--fs-small, 12px)', lineHeight: 1.5, color: 'var(--muted-foreground, #b2a5d9)' }}>
                Masih terkendala? Tutup Mini App dan buka lagi dari bot.
              </p>
            </div>
          </section>
          <p style={{ margin: 0, textAlign: 'center', fontSize: 'var(--fs-small, 12px)', lineHeight: 1.5, color: 'var(--muted-foreground, #b2a5d9)' }}>Bangun garasi. Kuasai lintasan.</p>
        </main>
      </body>
    </html>
  )
}
