#!/usr/bin/env node

/**
 * Run the Python test suite.
 *
 * Prefers the package-local virtualenv created by postinstall, then falls back
 * to the system interpreter. If pytest is not installed the suite is skipped
 * rather than failed, so `npm test` stays usable for people who installed only
 * the runtime dependencies.
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const packageRoot = path.join(__dirname, '..');
const isWindows = process.platform === 'win32';
const venvPython = path.join(packageRoot, '.venv', isWindows ? 'Scripts/python.exe' : 'bin/python');
const python = fs.existsSync(venvPython) ? venvPython : isWindows ? 'python' : 'python3';

// The published tarball excludes tests (see .npmignore), and pytest exits 5
// when it collects nothing — which would fail `npm test` for installed users.
if (!fs.existsSync(path.join(packageRoot, 'tests'))) {
  console.log('No tests directory in this install — nothing to run.');
  process.exit(0);
}

const hasPytest = spawnSync(python, ['-c', 'import pytest'], { stdio: 'ignore' }).status === 0;

if (!hasPytest) {
  console.log('pytest is not installed — skipping the Python test suite.');
  console.log(`Install it with: ${python} -m pip install pytest pytest-asyncio`);
  process.exit(0);
}

const result = spawnSync(python, ['-m', 'pytest', 'tests/', '-q'], {
  cwd: packageRoot,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
