import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Production builds ship a Content-Security-Policy that forbids any connection
// to another origin, so document data cannot leave the browser.
const csp = (): Plugin => ({
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml(html) {
    const policy = [
      "default-src 'self'",
      "script-src 'self' 'wasm-unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data:",
      "font-src 'self' blob: data:",
      "connect-src 'self' blob: data:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'none'",
    ].join('; ');
    return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
  },
});

export default defineConfig({
  plugins: [react(), csp()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  // harfbuzzjs locates its .wasm next to its own module, so it must not be pre-bundled.
  optimizeDeps: { esbuildOptions: { target: 'es2022' }, exclude: ['harfbuzzjs'] },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 30000 },
} as any);
