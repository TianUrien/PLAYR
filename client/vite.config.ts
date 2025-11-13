import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(__dirname, '..'), '')
  const localEnv = loadEnv(mode, __dirname, '')
  const mergedEnv = { ...rootEnv, ...localEnv }
  const devHost = mergedEnv.VITE_DEV_HOST ?? '0.0.0.0'
  const devPort = Number(mergedEnv.VITE_DEV_PORT ?? '5173')

  return {
    plugins: [react()],
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
    define: {
      'process.env.SUPABASE_URL': JSON.stringify(mergedEnv.SUPABASE_URL ?? ''),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(mergedEnv.SUPABASE_ANON_KEY ?? ''),
    },
    envPrefix: ['VITE_', 'SUPABASE_'],
  }
})
