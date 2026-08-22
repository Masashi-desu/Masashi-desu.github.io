/**
 * テスト概要:
 *  - 目的: 文書だけの変更を重いブラウザテストなしで安全に検証できるようにする。
 *  - 期待値: Markdownのローカル参照とnpm script参照が解決し、第三者依存、Google Fonts、
 *    READMEのOpen Graph画像がリポジトリの実体と一致する。
 *  - 検証方法: 追跡対象外の生成ディレクトリを除いてMarkdownとソースを静的走査し、
 *    package-lock、package.json、site/index.htmlの値と照合する。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IGNORED_DIRECTORIES = new Set(['.git', '.temp', 'dist', 'node_modules']);
const markdownFiles = collectMarkdownFiles(REPOSITORY_ROOT);
const packageJson = readJson('package.json');
const packageLock = readJson('package-lock.json');
const thirdPartyNotice = readText('THIRD_PARTY_LICENSES.md');
const failures = [];

validateMarkdownReferences();
validateNpmScriptReferences();
validateThirdPartyPackages();
validateGoogleFonts();
validateReadmeOpenGraphImage();

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Documentation integrity checks passed (${markdownFiles.length} Markdown files).`);
}

function collectMarkdownFiles(directory, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectMarkdownFiles(entryPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(entryPath);
    }
  }
  return files;
}

function validateMarkdownReferences() {
  const markdownLinkPattern = /\[[^\]]*\]\(([^)]+)\)/gu;

  for (const filePath of markdownFiles) {
    const source = readFileSync(filePath, 'utf8');
    for (const match of source.matchAll(markdownLinkPattern)) {
      const target = match[1].replace(/^<|>$/gu, '');
      if (/^(?:https?:|mailto:|#)/u.test(target)) {
        continue;
      }

      const localTarget = decodeURIComponent(target.split('#')[0]);
      if (localTarget && !existsSync(resolve(dirname(filePath), localTarget))) {
        fail(filePath, `ローカル参照が存在しません: ${target}`);
      }
    }
  }
}

function validateNpmScriptReferences() {
  const npmScriptPattern = /npm run ([a-zA-Z0-9:_-]+)/gu;

  for (const filePath of markdownFiles) {
    const source = readFileSync(filePath, 'utf8');
    for (const match of source.matchAll(npmScriptPattern)) {
      if (!Object.hasOwn(packageJson.scripts, match[1])) {
        fail(filePath, `未定義のnpm scriptを参照しています: ${match[1]}`);
      }
    }
  }
}

function validateThirdPartyPackages() {
  const packageNames = new Set();

  for (const [packagePath, metadata] of Object.entries(packageLock.packages)) {
    if (!packagePath.startsWith('node_modules/')) {
      continue;
    }
    packageNames.add(metadata.name ?? packagePath.replace(/^node_modules\//u, '').replace(/^vite\/node_modules\//u, ''));
  }

  for (const packageName of packageNames) {
    if (!thirdPartyNotice.includes(packageName)) {
      fail('THIRD_PARTY_LICENSES.md', `package-lockの依存が記載されていません: ${packageName}`);
    }
  }
}

function validateGoogleFonts() {
  const supportedExtensions = new Set(['.css', '.html', '.js', '.mjs']);
  const sourceFiles = [
    ...collectSourceFiles(resolve(REPOSITORY_ROOT, 'site'), supportedExtensions),
    ...collectSourceFiles(resolve(REPOSITORY_ROOT, 'tools'), supportedExtensions),
  ];
  const fontFamilies = new Set();

  for (const sourceFile of sourceFiles) {
    const source = readFileSync(sourceFile, 'utf8');
    if (!source.includes('fonts.googleapis.com')) {
      continue;
    }

    const normalizedSource = source.replaceAll('&amp;', '&');
    for (const match of normalizedSource.matchAll(/family=([^&"'<>]+)/gu)) {
      fontFamilies.add(decodeURIComponent(match[1].split(':')[0].replaceAll('+', ' ')));
    }
  }

  for (const fontFamily of fontFamilies) {
    if (!thirdPartyNotice.includes(fontFamily)) {
      fail('THIRD_PARTY_LICENSES.md', `Google Fontsのfamilyが記載されていません: ${fontFamily}`);
    }
  }
}

function collectSourceFiles(directory, supportedExtensions, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(entryPath, supportedExtensions, files);
    } else if (entry.isFile() && supportedExtensions.has(extname(entry.name))) {
      files.push(entryPath);
    }
  }
  return files;
}

function validateReadmeOpenGraphImage() {
  const homePage = readText('site/index.html');
  const readme = readText('README.md');
  const match = homePage.match(/<meta property="og:image" content="([^"]+)"/u);

  if (!match) {
    fail('site/index.html', 'og:imageが見つかりません。');
    return;
  }

  const imageUrl = new URL(match[1]);
  const sourcePath = `site${imageUrl.pathname}`;
  if (!existsSync(resolve(REPOSITORY_ROOT, sourcePath))) {
    fail('site/index.html', `og:imageのソースが存在しません: ${sourcePath}`);
  }
  if (!readme.includes(`./${sourcePath}`)) {
    fail('README.md', `トップページのog:imageを表示していません: ./${sourcePath}`);
  }
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function readText(filePath) {
  return readFileSync(resolve(REPOSITORY_ROOT, filePath), 'utf8');
}

function fail(filePath, message) {
  failures.push(`${relative(REPOSITORY_ROOT, resolve(REPOSITORY_ROOT, filePath))}: ${message}`);
}
