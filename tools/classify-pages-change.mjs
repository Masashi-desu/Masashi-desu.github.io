import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const APPCAST_PATH = 'site/products/TypeFetch/appcast.xml';
const METADATA_FIELDS = new Set([
  'author',
  'bugs',
  'description',
  'directories',
  'homepage',
  'keywords',
  'license',
  'main',
  'name',
  'repository',
  'version',
]);

export function classifyReleaseScope({
  changedFiles,
  beforePackageJson,
  currentPackageJson,
  beforePackageLock,
  currentPackageLock,
}) {
  let testRequired = false;
  let deployRequired = false;
  const changedFileSet = new Set(changedFiles);

  for (const changedFile of changedFileSet) {
    if (changedFile === APPCAST_PATH || changedFile === 'package.json' || changedFile === 'package-lock.json') {
      continue;
    }

    if (changedFile === 'vite.config.mjs' || changedFile.startsWith('site/')) {
      testRequired = true;
      deployRequired = true;
    } else if (
      changedFile.startsWith('tests/')
      || changedFile.startsWith('tools/')
      || changedFile.startsWith('.github/workflows/')
    ) {
      testRequired = true;
    }
  }

  if (changedFileSet.has('package.json')) {
    const packageScope = classifyPackageJson(beforePackageJson, currentPackageJson);
    testRequired ||= packageScope.test;
    deployRequired ||= packageScope.deploy;
  }

  if (changedFileSet.has('package-lock.json')) {
    testRequired = true;
    deployRequired ||= buildDependencyFingerprint(beforePackageLock) !== buildDependencyFingerprint(currentPackageLock);
  }

  return { test: testRequired, deploy: deployRequired };
}

export function classifyPackageJson(beforePackageJson, currentPackageJson) {
  if (!beforePackageJson || !currentPackageJson) {
    return { test: true, deploy: true };
  }

  const testRequired = stableJson(excludeMetadata(beforePackageJson)) !== stableJson(excludeMetadata(currentPackageJson));
  const deployRequired = (
    stableJson(beforePackageJson.dependencies) !== stableJson(currentPackageJson.dependencies)
    || beforePackageJson.devDependencies?.vite !== currentPackageJson.devDependencies?.vite
    || beforePackageJson.scripts?.build !== currentPackageJson.scripts?.build
    || beforePackageJson.type !== currentPackageJson.type
  );

  return { test: testRequired, deploy: deployRequired };
}

export function buildDependencyFingerprint(packageLock) {
  if (!packageLock?.packages) {
    return 'missing';
  }

  const packageEntries = packageLock.packages;
  const pending = ['node_modules/three', 'node_modules/vite'];
  const visited = new Set();
  const fingerprint = {};

  while (pending.length > 0) {
    const packagePath = pending.pop();
    if (visited.has(packagePath)) {
      continue;
    }
    visited.add(packagePath);

    const metadata = packageEntries[packagePath];
    if (!metadata) {
      fingerprint[packagePath] = null;
      continue;
    }

    fingerprint[packagePath] = metadata;
    const dependencies = {
      ...metadata.dependencies,
      ...metadata.optionalDependencies,
    };
    for (const dependencyName of Object.keys(dependencies)) {
      const dependencyPath = resolveLockPackage(packageEntries, packagePath, dependencyName);
      if (dependencyPath) {
        pending.push(dependencyPath);
      }
    }
  }

  return stableJson(fingerprint);
}

function resolveLockPackage(packageEntries, parentPath, dependencyName) {
  const nestedPath = `${parentPath}/node_modules/${dependencyName}`;
  if (packageEntries[nestedPath]) {
    return nestedPath;
  }

  const rootPath = `node_modules/${dependencyName}`;
  return packageEntries[rootPath] ? rootPath : null;
}

function excludeMetadata(packageJson) {
  return Object.fromEntries(
    Object.entries(packageJson).filter(([key]) => !METADATA_FIELDS.has(key)),
  );
}

function stableJson(value) {
  return JSON.stringify(sortValue(value ?? null));
}

function sortValue(value) {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortValue(child)]),
    );
  }
  return value;
}

function readJsonAtRevision(revision, filePath) {
  return JSON.parse(execFileSync('git', ['show', `${revision}:${filePath}`], { encoding: 'utf8' }));
}

function runCli() {
  const [beforeRevision, currentRevision] = process.argv.slice(2);
  if (!beforeRevision || !currentRevision || /^0+$/u.test(beforeRevision)) {
    console.log('test=true');
    console.log('deploy=true');
    return;
  }

  const changedFiles = execFileSync(
    'git',
    ['diff', '--name-only', beforeRevision, currentRevision],
    { encoding: 'utf8' },
  ).trim().split('\n').filter(Boolean);
  const packageJsonChanged = changedFiles.includes('package.json');
  const packageLockChanged = changedFiles.includes('package-lock.json');
  const result = classifyReleaseScope({
    changedFiles,
    beforePackageJson: packageJsonChanged ? readJsonAtRevision(beforeRevision, 'package.json') : null,
    currentPackageJson: packageJsonChanged ? readJsonAtRevision(currentRevision, 'package.json') : null,
    beforePackageLock: packageLockChanged ? readJsonAtRevision(beforeRevision, 'package-lock.json') : null,
    currentPackageLock: packageLockChanged ? readJsonAtRevision(currentRevision, 'package-lock.json') : null,
  });

  console.log(`test=${result.test}`);
  console.log(`deploy=${result.deploy}`);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  runCli();
}
