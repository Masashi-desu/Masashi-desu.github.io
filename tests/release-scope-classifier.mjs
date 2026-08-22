/**
 * テスト概要:
 *  - 目的: mainへのpushで、変更範囲に不要なCI・Pages deployを起動しないことを検証する。
 *  - 期待値: 文書とpackage metadataだけの変更は処理不要、検証資源はCIのみ、公開入力はCIとdeploy、
 *    appcast単独更新は専用workflowへ委譲される。
 *  - 検証方法: 代表的な変更ファイルとpackage差分を分類器へ渡し、test/deployの真偽を比較する。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyPackageJson, classifyReleaseScope } from '../tools/classify-pages-change.mjs';

const basePackage = {
  name: 'example',
  version: '1.0.0',
  description: 'before',
  type: 'commonjs',
  scripts: {
    build: 'vite build',
    test: 'node test.js',
  },
  dependencies: {
    three: '1.0.0',
  },
  devDependencies: {
    playwright: '1.0.0',
    vite: '1.0.0',
  },
};

test('文書だけの変更はCIもdeployも不要', () => {
  assert.deepEqual(classify(['README.md', 'docs/spec.md']), { test: false, deploy: false });
});

test('テストとworkflowの変更はCIだけ必要', () => {
  assert.deepEqual(classify(['tests/example.js', '.github/workflows/deploy.yml']), { test: true, deploy: false });
});

test('siteとVite設定の変更はCIとdeployが必要', () => {
  assert.deepEqual(classify(['site/index.html']), { test: true, deploy: true });
  assert.deepEqual(classify(['vite.config.mjs']), { test: true, deploy: true });
});

test('appcast単独更新は専用workflowへ委譲', () => {
  assert.deepEqual(classify(['site/products/TypeFetch/appcast.xml']), { test: false, deploy: false });
});

test('package metadataだけの変更はCIもdeployも不要', () => {
  const currentPackage = structuredClone(basePackage);
  currentPackage.description = 'after';
  assert.deepEqual(classifyPackageJson(basePackage, currentPackage), { test: false, deploy: false });
});

test('テストscriptとPlaywrightの変更はCIだけ必要', () => {
  const currentPackage = structuredClone(basePackage);
  currentPackage.scripts.test = 'node another-test.js';
  currentPackage.devDependencies.playwright = '2.0.0';
  assert.deepEqual(classifyPackageJson(basePackage, currentPackage), { test: true, deploy: false });
});

test('build script、Vite、runtime依存の変更はdeployが必要', () => {
  for (const mutate of [
    (currentPackage) => { currentPackage.scripts.build = 'vite build --emptyOutDir'; },
    (currentPackage) => { currentPackage.devDependencies.vite = '2.0.0'; },
    (currentPackage) => { currentPackage.dependencies.three = '2.0.0'; },
  ]) {
    const currentPackage = structuredClone(basePackage);
    mutate(currentPackage);
    assert.deepEqual(classifyPackageJson(basePackage, currentPackage), { test: true, deploy: true });
  }
});

test('build依存のlockfile変更だけdeploy対象になる', () => {
  const beforeLock = createLock();
  const playwrightLock = structuredClone(beforeLock);
  playwrightLock.packages['node_modules/playwright'].version = '2.0.0';
  assert.deepEqual(classify(['package-lock.json'], { beforeLock, currentLock: playwrightLock }), { test: true, deploy: false });

  const viteLock = structuredClone(beforeLock);
  viteLock.packages['node_modules/rolldown'].version = '2.0.0';
  assert.deepEqual(classify(['package-lock.json'], { beforeLock, currentLock: viteLock }), { test: true, deploy: true });
});

function classify(changedFiles, options = {}) {
  return classifyReleaseScope({
    changedFiles,
    beforePackageJson: options.beforePackage ?? null,
    currentPackageJson: options.currentPackage ?? null,
    beforePackageLock: options.beforeLock ?? null,
    currentPackageLock: options.currentLock ?? null,
  });
}

function createLock() {
  return {
    packages: {
      'node_modules/three': { version: '1.0.0' },
      'node_modules/vite': {
        version: '1.0.0',
        dependencies: { rolldown: '1.0.0' },
      },
      'node_modules/rolldown': { version: '1.0.0' },
      'node_modules/playwright': { version: '1.0.0' },
    },
  };
}
