import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    watch: false,
    globals: true,
    projects: [
      {
        extends: true,
        test: { name: 'server', environment: 'node', include: ['server/**/*.spec.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'client',
          environment: 'jsdom',
          setupFiles: ['./src/test-setup.ts'],
          include: ['src/**/*.spec.{ts,tsx}'],
        },
      },
    ],
  },
})
