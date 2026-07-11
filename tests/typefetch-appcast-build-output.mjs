// 目的: Vite build が TypeFetch appcast を正式 URL と旧互換 URL の両方へ出力することを検証します。
// 期待値: 2 つの appcast.xml が存在し、バイト単位で完全に一致します。
// 検証方法: npm run build 後の dist 配下にある 2 ファイルを読み込み、内容を比較します。

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const canonicalPath = resolve(root, 'dist/products/TypeFetch/appcast.xml');
const legacyPath = resolve(root, 'dist/works/products/TypeFetch/appcast.xml');
const [canonical, legacy] = await Promise.all([
  readFile(canonicalPath),
  readFile(legacyPath),
]);

assert.deepEqual(legacy, canonical, 'legacy TypeFetch appcast must exactly match the canonical appcast');
console.log('TypeFetch appcast build outputs match');
