import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@snapsort/mock', '@snapsort/contract', '@snapsort/ui'],
      }),
    ],
    resolve: {
      alias: {
        '@snapsort/contract': resolve(__dirname, '../../packages/contract/src'),
        '@snapsort/mock': resolve(__dirname, '../../packages/mock/src'),
      },
    },
  },
  preload: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@snapsort/mock', '@snapsort/contract', '@snapsort/ui'],
      }),
    ],
  },
  renderer: {
    plugins: [tailwindcss(), react()],
    resolve: {
      alias: {
        '@snapsort/contract': resolve(__dirname, '../../packages/contract/src'),
        '@snapsort/mock': resolve(__dirname, '../../packages/mock/src'),
        '@snapsort/ui': resolve(__dirname, '../../packages/ui/src'),
      },
    },
  },
});
