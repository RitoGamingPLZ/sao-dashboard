// The dashboard is a live, client-only control panel, so it runs as an SPA
// (no SSR); all game traffic stays on the Nitro server in server/.
export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  ssr: false,
  devtools: { enabled: false },
  telemetry: false,
  css: ['~/assets/style.css'],
  app: {
    head: {
      title: 'SAO Command Deck',
      htmlAttrs: { lang: 'en', 'data-theme': 'color' },
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    },
  },
  typescript: { strict: true },
})
