import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Pages that read the database or the session render per request; the rest are static.
  // (Cache Components would prerender at build time, which needs the database during the build.)
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  poweredByHeader: false,
  turbopack: {
    // The site imports shared code from ../pdf-editor, so the project root is the repository.
    root: path.join(__dirname, '..'),
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        // The PDF editor is embedded in its own page; it may be framed by this site only.
        source: '/:path*',
        headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }],
      },
    ];
  },
};

export default nextConfig;
