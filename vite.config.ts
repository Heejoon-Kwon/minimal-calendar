import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  build: {
    rolldownOptions: {
      output: { codeSplitting: { groups: [{ name: 'supabase', test: /node_modules\/@supabase\// }] } },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png'],
      manifest: {
        name: 'Monthline · 월간 캘린더',
        short_name: 'Monthline',
        lang: 'ko',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f8f9fb',
        theme_color: '#111111',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
