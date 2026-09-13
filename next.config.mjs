/**
 * Content-Security-Policy dibangun di sini, bukan ditulis sebagai satu string
 * panjang, supaya tiap direktif punya alasan yang bisa dibaca.
 *
 * `script-src` masih memakai 'unsafe-inline': Next menyuntikkan script inline
 * untuk hydration tanpa nonce di konfigurasi ini, jadi melarangnya akan
 * mematikan app — bukan mengeraskannya. Yang tetap didapat: default-src yang
 * mengunci asal, object-src 'none', base-uri terkunci, dan daftar host yang
 * eksplisit untuk skrip Telegram serta foto profil pemain.
 *
 * 'unsafe-eval' hanya di luar produksi karena React Fast Refresh membutuhkannya;
 * build produksi tidak, jadi produksi tidak perlu menanggungnya.
 */
const isProduction = process.env.NODE_ENV === 'production'

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"} https://telegram.org`,
  "style-src 'self' 'unsafe-inline'",
  /**
   * Foto profil pemain. `photo_url` di initData menunjuk ke t.me, tapi t.me
   * membalas 302 ke CDN-nya, jadi mengizinkan t.me SAJA memblokir avatarnya:
   * CSP memeriksa ulang target redirect terhadap policy ini, dan host di sana
   * ikut ditegakkan. blob: dipakai canvas WebGL.
   *
   * Hanya produksi yang bisa menunjukkan ini -- identitas preview selalu
   * punya photoUrl null, jadi `pnpm dev` tidak pernah merender <img> itu.
   */
  "img-src 'self' data: blob: https://t.me https://*.cdn-telegram.org",
  "font-src 'self' data:",
  "connect-src 'self' https://telegram.org",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

/**
 * Racely dibuka di dalam iframe Telegram, jadi app pemain TIDAK boleh memasang
 * frame-ancestors — itu akan memutus Telegram Web. Panel admin justru sebaliknya:
 * ia tidak pernah di-iframe siapa pun, jadi ia menolak dijadikan frame.
 *
 * Direktifnya DIGABUNG ke dalam satu header, bukan dikirim sebagai header CSP
 * kedua. Next menerapkan header custom dengan `resHeaders[key] = value` — kunci
 * yang sama DITIMPA, bukan ditumpuk (lihat
 * `next/dist/server/lib/router-utils/resolve-routes.js`). Header kedua yang
 * hanya berisi frame-ancestors karena itu membuang seluruh sisa policy di
 * /admin: default-src, object-src, base-uri, form-action, semuanya hilang —
 * persis di satu-satunya halaman yang menyetujui pembayaran rupiah.
 */
const adminContentSecurityPolicy = `${contentSecurityPolicy}; frame-ancestors 'none'`

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async headers() {
    return [
      { source: '/(.*)', headers: [
        { key: 'Content-Security-Policy', value: contentSecurityPolicy },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ] },
      { source: '/admin/:path*', headers: [
        { key: 'Content-Security-Policy', value: adminContentSecurityPolicy },
      ] },
      { source: '/admin', headers: [
        { key: 'Content-Security-Policy', value: adminContentSecurityPolicy },
      ] },
    ]
  },
  images: {
    unoptimized: true,
    // Inert selama `unoptimized: true`, tapi didaftarkan berpasangan dengan
    // img-src supaya mematikan flag itu tidak menghidupkan bug yang sama lagi.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 't.me',
        pathname: '/i/userpic/**',
      },
      {
        protocol: 'https',
        hostname: '*.cdn-telegram.org',
      },
    ],
  },
}

export default nextConfig
