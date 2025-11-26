import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(__dirname, '..'), '')
  const localEnv = loadEnv(mode, __dirname, '')
  const mergedEnv = { ...rootEnv, ...localEnv }
  const devHost = mergedEnv.VITE_DEV_HOST ?? '0.0.0.0'
  const devPort = Number(mergedEnv.VITE_DEV_PORT ?? '5173')
  const enableSentryUploads = Boolean(
    mergedEnv.SENTRY_AUTH_TOKEN &&
    mergedEnv.SENTRY_ORG &&
    mergedEnv.SENTRY_PROJECT
  )
  const manualChunkGroups: Array<{ name: string; pattern: RegExp }> = [
    { name: 'react', pattern: /node_modules\/(react|react-dom|scheduler|shared)\// },
    { name: 'supabase', pattern: /node_modules\/(@supabase|@supabase-cache-helpers)\// },
    { name: 'tanstack', pattern: /node_modules\/(@tanstack|@hookform)\// },
    { name: 'state', pattern: /node_modules\/(zustand|immer)\// },
    { name: 'icons', pattern: /node_modules\/lucide-react\// },
    { name: 'datetime', pattern: /node_modules\/date-fns\// }
  ]

  return {
    plugins: [
      react(),
      enableSentryUploads &&
        sentryVitePlugin({
          authToken: mergedEnv.SENTRY_AUTH_TOKEN,
          org: mergedEnv.SENTRY_ORG,
          project: mergedEnv.SENTRY_PROJECT,
          telemetry: false,
          sourcemaps: {
            assets: './dist/assets',
          },
        }),
    ].filter(Boolean),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        // Rolldown struggles to resolve tslib automatically when bundling Supabase SDK
        tslib: path.resolve(__dirname, './node_modules/tslib/tslib.es6.js'),
      },
    },
    server: {
      host: devHost === 'true' ? true : devHost,
      port: Number.isNaN(devPort) ? 5173 : devPort,
      strictPort: true,
    },
    preview: {
      host: devHost === 'true' ? true : devHost,
      port: Number.isNaN(devPort) ? 5173 : devPort,
      strictPort: true,
    },
    build: {
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return undefined
            }

            const matchedGroup = manualChunkGroups.find(group => group.pattern.test(id))
            if (matchedGroup) {
              return matchedGroup.name
            }

            return 'vendor'
          }
        }
      }
    },
    define: {
      'process.env.SUPABASE_URL': JSON.stringify(mergedEnv.SUPABASE_URL ?? ''),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(mergedEnv.SUPABASE_ANON_KEY ?? ''),
    },
    envPrefix: ['VITE_', 'SUPABASE_'],
    test: {
      environment: 'jsdom',
      globals: true,
      css: true,
      setupFiles: ['./src/test/setup.ts'],
      exclude: ['**/e2e/**', '**/node_modules/**', '**/dist/**'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        reportsDirectory: 'coverage'
      }
    }
  }
})
