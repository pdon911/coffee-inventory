import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: 'http://127.0.0.1:8080',
            changeOrigin: true,
          },
        },
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['logo.png', 'croissant-logo.png'],
          manifest: {
            name: 'Inventory',
            short_name: 'Inventory',
            description: 'Inventory Management for Coffee Villain',
            theme_color: '#000000',
            background_color: '#000000',
            display: 'standalone',
            start_url: '/',
            icons: [
              {
                src: 'croissant-logo.png',
                sizes: '192x192',
                type: 'image/png'
              },
              {
                src: 'croissant-logo.png',
                sizes: '512x512',
                type: 'image/png'
              },
              {
                src: 'croissant-logo.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any maskable'
              }
            ]
          }
        })
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      test: {
        exclude: ['**/*.test.*', '**/*.spec.*']
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
