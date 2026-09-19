/**
 * 目的: リモートCIを縮小しても、ローカルのフル検証とappcast専用の公開前検証を維持する。
 * 期待値: ローカルは全ブラウザ群とmacOS検証、CIは軽量な部分集合、appcastは生成・build出力を検証する。
 * 検証方法: npm scriptの依存グラフと、Ruby/Psychで構造解析した実際のworkflowを照合する。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const { scripts } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

function scriptGraph(name, stack = []) {
  assert.ok(Object.hasOwn(scripts, name), `Missing npm script: ${name}`);
  assert.ok(!stack.includes(name), `Cyclic npm scripts: ${[...stack, name].join(' -> ')}`);
  const names = new Set([name]);
  const commands = new Set();
  for (const command of scripts[name].split('&&').map(value => value.trim())) {
    const nested = /^npm run ([\w:-]+)$/.exec(command);
    if (!nested) {
      commands.add(command);
      continue;
    }
    const child = scriptGraph(nested[1], [...stack, name]);
    child.names.forEach(value => names.add(value));
    child.commands.forEach(value => commands.add(value));
  }
  return { names, commands };
}

function workflow(name) {
  return JSON.parse(execFileSync('ruby', [
    '-ryaml', '-rjson', '-e', 'puts JSON.generate(YAML.safe_load(File.read(ARGV.fetch(0)), aliases: true))',
    resolve(root, '.github/workflows', name)
  ], { encoding: 'utf8' }));
}

test('npm test retains every full suite and native checks independently of minimal CI', () => {
  const local = scriptGraph('test');
  for (const name of ['test:full', 'test:non-browser', 'test:pc-browser', 'test:mobile-chromium', 'test:webkit', 'test:local-environment']) {
    assert.ok(local.names.has(name), `Local gate must include ${name}`);
  }
  assert.ok(!local.names.has('test:ci'), 'Narrowing CI must not narrow the local gate');
});

test('minimal CI is a tested subset with both browser engines and no full page suites', () => {
  const ci = scriptGraph('test:ci');
  const local = scriptGraph('test');
  for (const name of ['test:non-browser', 'test:segmented-package', 'test:segmented-package:webkit']) {
    assert.ok(ci.names.has(name), `CI must include ${name}`);
  }
  for (const name of ['test:full', 'test:pc-browser', 'test:mobile-chromium', 'test:webkit', 'test:local-environment']) {
    assert.ok(!ci.names.has(name), `Full suite ${name} does not belong in minimal CI`);
  }
  for (const command of ci.commands) assert.ok(local.commands.has(command), `Not covered locally: ${command}`);
});

test('normal Pages deployment waits for minimal CI', () => {
  const { jobs } = workflow('deploy.yml');
  const commands = jobs['quality-gate'].steps.map(step => step.run).filter(Boolean);
  assert.ok(commands.includes('npm run test:ci'));
  assert.ok(commands.includes('npx playwright install --with-deps chromium webkit'));
  assert.ok(jobs.build.needs.includes('quality-gate'));
  assert.equal(jobs.deploy.needs, 'build');
});

test('automated appcast updates validate generation and built XML before commit without full browser tests', () => {
  const { jobs } = workflow('sync-typefetch-appcast.yml');
  const steps = jobs.sync.steps;
  const check = steps.findIndex(step => step.run === 'npm run test:typefetch-appcast');
  const commit = steps.findIndex(step => step.id === 'commit');
  assert.ok(check >= 0 && commit > check, 'Appcast checks must succeed before commit');
  assert.ok(steps.every(step => !/playwright install|npm run test:(?:ci|full)|npm test\b/.test(step.run || '')));
  const appcast = scriptGraph('test:typefetch-appcast');
  for (const name of ['test:typefetch-appcast-unit', 'build', 'test:typefetch-appcast-output']) {
    assert.ok(appcast.names.has(name), `Appcast gate must include ${name}`);
  }
  assert.ok(jobs.build.steps.some(step => step.run === 'npm run test:typefetch-appcast-output'));
});
