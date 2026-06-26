import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

function normalizeBasePath(value: string | undefined) {
  if (!value) {
    return '/'
  }

  if (value === '' || value === './') {
    return value
  }

  return value.endsWith('/') ? value : `${value}/`
}

// https://vite.dev/config/
export default defineConfig({
  base: normalizeBasePath(process.env.VITE_BASE_PATH),
  plugins: [react()],
  test: {
    environment: 'jsdom',
    execArgv: ['--no-webstorage'],
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/',
      },
    },
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
