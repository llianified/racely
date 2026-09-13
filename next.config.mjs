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
  // t.me melayani foto profil Telegram; blob: dipakai canvas WebGL.
  "img-src 'self' data: blob: https://t.me",
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
 * ia tidak pernah di-iframe siapa pun, jadi ia menolak dijadikan frame. Dikirim
 * sebagai header CSP kedua khusus /admin; browser menegakkan irisan keduanya.
 */
const adminFrameGuard = "frame-ancestors 'none'"

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
        { key: 'Content-Security-Policy', value: adminFrameGuard },
      ] },
      { source: '/admin', headers: [
        { key: 'Content-Security-Policy', value: adminFrameGuard },
      ] },
    ]
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 't.me',
        pathname: '/i/userpic/**',
      },
    ],
  },
}

export default nextConfig
