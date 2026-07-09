import type { NextConfig } from 'next'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).hostname : ''

const nextConfig: NextConfig = {
  // Operação Pixel Perfect — PDFs de laudos podem chegar a 50MB.
  // Server Actions default = 1MB; subimos o teto para acomodar uploads reais.
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // HSTS: força HTTPS e mitiga SSL-stripping/MITM (a Vercel não injeta sozinha).
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: [
              'camera=()',
              'geolocation=()',
              'microphone=(self)',  // Web Speech API para transcrição de consultas
              'payment=()',
              'usb=()',
            ].join(', '),
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self'",
              `img-src 'self' data: blob: ${supabaseHost ? `https://${supabaseHost}` : ''}`,
              `connect-src 'self' ${supabaseUrl} ${supabaseUrl.replace('https://', 'wss://')} https://api.anthropic.com`,
              "media-src 'self'",
              "worker-src 'self' blob:",
              "frame-ancestors 'none'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ]
  },

  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: 'https', hostname: supabaseHost }]
      : [],
  },
}

export default nextConfig
