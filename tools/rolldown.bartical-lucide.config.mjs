import { defineConfig } from 'rolldown';

export default defineConfig({
  input: 'tools/bartical-lucide-entry.mjs',
  output: {
    file: 'site/vendor/bartical-lucide.min.js',
    format: 'iife',
    name: 'BarticalLucide',
    banner: '/*! Bartical Lucide subset — Lucide v1.31.0, ISC License. See lucide.LICENSE.txt. */'
  },
  treeshake: true
});
