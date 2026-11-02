import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { standaloneScheme } = require('../plugins/with-standalone-run.cjs');
test('Xcode Run uses an embedded bundle without changing test/debug configurations', () => {
  const xml = '<TestAction buildConfiguration = "Debug"/><LaunchAction buildConfiguration = "Debug"/><AnalyzeAction buildConfiguration = "Debug"/>';
  const patched = standaloneScheme(xml);
  assert.match(patched, /LaunchAction buildConfiguration = "Release"/);
  assert.match(patched, /TestAction buildConfiguration = "Debug"/);
  assert.match(patched, /AnalyzeAction buildConfiguration = "Debug"/);
  assert.equal(standaloneScheme(patched), patched);
  const actual = readFileSync(new URL('../ios/ChefJarvis.xcodeproj/xcshareddata/xcschemes/ChefJarvis.xcscheme', import.meta.url), 'utf8');
  assert.match(actual, /<LaunchAction\s+buildConfiguration = "Release"/);
  const config = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
  assert.ok(config.expo.plugins.includes('./plugins/with-standalone-run.cjs'));
});
