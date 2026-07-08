import { copyFileSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { defineConfig } from 'vite';

const ROOT = import.meta.dirname;
const SITE_ROOT = resolve(ROOT, 'site');
const OUT_DIR = resolve(ROOT, 'dist');
const HTML_INPUTS = collectHtmlInputs(SITE_ROOT);
const ROOT_STATIC_FILES = ['theme.css', 'theme.js', 'footer.js'];
const STATIC_DIRS = ['partials', 'products', 'vendor'];

export default defineConfig({
  root: SITE_ROOT,
  appType: 'mpa',
  base: '/',
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
    rolldownOptions: {
      input: HTML_INPUTS,
    },
  },
  plugins: [copyStaticSiteAssets()],
});

function collectHtmlInputs(dir, inputs = {}) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (shouldSkipDirectory(entry.name)) {
      continue;
    }

    const entryPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      collectHtmlInputs(entryPath, inputs);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.html')) {
      const relativePath = relative(SITE_ROOT, entryPath);
      inputs[relativePath.replace(/\.html$/u, '')] = entryPath;
    }
  }

  return inputs;
}

function shouldSkipDirectory(name) {
  return name === 'partials';
}

function copyStaticSiteAssets() {
  return {
    name: 'copy-static-site-assets',
    apply: 'build',
    closeBundle() {
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(resolve(OUT_DIR, '.nojekyll'), '');

      for (const file of ROOT_STATIC_FILES) {
        copyFileIfExists(resolve(SITE_ROOT, file), resolve(OUT_DIR, file));
      }

      for (const dir of STATIC_DIRS) {
        copyDirectory(resolve(SITE_ROOT, dir), resolve(OUT_DIR, dir), {
          excludeHtml: dir === 'products',
        });
      }
    },
  };
}

function copyDirectory(source, destination, options = {}) {
  const sourceStats = statSync(source, { throwIfNoEntry: false });
  if (!sourceStats?.isDirectory()) {
    return;
  }

  mkdirSync(destination, { recursive: true });

  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourcePath = resolve(source, entry.name);
    const destinationPath = resolve(destination, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath, options);
      continue;
    }

    if (entry.isFile()) {
      if (options.excludeHtml && extname(entry.name) === '.html') {
        continue;
      }
      copyFileIfExists(sourcePath, destinationPath);
    }
  }
}

function copyFileIfExists(source, destination) {
  const sourceStats = statSync(source, { throwIfNoEntry: false });
  if (!sourceStats?.isFile()) {
    return;
  }

  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}
