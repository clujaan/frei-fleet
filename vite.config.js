import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { APP_NAME, APP_SHORT_NAME, APP_TAGLINE, ASSETS, COLORS } from './src/config/brand.js'
import { devApi } from './scripts/dev-api.mjs'

// Înlocuiește %APP_NAME% / %THEME_COLOR% din index.html cu valorile din src/config/brand.js
const htmlBrand = {
  name: 'html-brand',
  transformIndexHtml: (html) => html.replaceAll('%APP_NAME%', APP_NAME).replaceAll('%THEME_COLOR%', COLORS.primary),
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '') // .env, .env.local (nu se urcă în Git)
  return {
    plugins: [
      react(),
      tailwindcss(),
      htmlBrand,
      devApi(env), // funcțiile din /api rulează local, în `npm run dev`
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [ASSETS.appleTouch, ASSETS.logo, ASSETS.logoWhite],
        manifest: {
          name: APP_NAME,
          short_name: APP_SHORT_NAME,
          description: `${APP_NAME} – ${APP_TAGLINE.ro}`,
          theme_color: COLORS.primary,
          background_color: COLORS.primary,
          display: 'standalone',
          start_url: '/',
          lang: 'ro',
          icons: [
            { src: ASSETS.icon192, sizes: '192x192', type: 'image/png' },
            { src: ASSETS.icon512, sizes: '512x512', type: 'image/png' },
            { src: ASSETS.iconMaskable, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: { navigateFallback: '/index.html', navigateFallbackDenylist: [/^\/api\//, /^\/forms\//], globPatterns: ['**/*.{js,css,html,png,jpg,svg}'] },
      }),
    ],
  }
})
