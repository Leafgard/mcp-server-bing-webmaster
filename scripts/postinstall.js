#!/usr/bin/env node

/**
 * Post-install script: verify Python and install the Python dependencies.
 *
 * This package ships a Python MCP server behind a thin Node launcher, so npm
 * install alone leaves it unrunnable — `mcp`, `httpx` and `python-dotenv` are
 * declared in pyproject.toml and nothing installs them. We create a virtualenv
 * beside run.js and install into it; run.js prefers that venv when it exists,
 * so nothing touches the user's system Python.
 */

const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const packageRoot = path.join(__dirname, '..');
const venvPath = path.join(packageRoot, '.venv');
const isWindows = process.platform === 'win32';
const venvPython = path.join(venvPath, isWindows ? 'Scripts/python.exe' : 'bin/python');

console.log('\n🔧 MCP Server for Bing Webmaster Tools - Post Install');
console.log('================================================\n');

function has(command) {
  const probe = spawnSync(command, ['--version'], { stdio: 'ignore', shell: isWindows });
  return probe.status === 0;
}

// 1. Check Python
const pythonCommand = isWindows ? 'python' : 'python3';
let pythonVersion;
try {
  pythonVersion = execSync(`${pythonCommand} --version`, { encoding: 'utf8' }).trim();
  const versionMatch = pythonVersion.match(/Python (\d+)\.(\d+)\.(\d+)/);
  if (versionMatch) {
    const major = parseInt(versionMatch[1], 10);
    const minor = parseInt(versionMatch[2], 10);
    if (major > 3 || (major === 3 && minor >= 10)) {
      console.log('✅ Python requirement satisfied: ' + pythonVersion);
    } else {
      console.log('⚠️  Python 3.10 or higher is required. Found: ' + pythonVersion);
      console.log('   Please upgrade Python, then re-run: npm rebuild\n');
      process.exit(0);
    }
  }
} catch (error) {
  console.log('❌ Python is not installed or not in PATH');
  console.log('   This package requires Python 3.10 or higher to run.');
  console.log('   Install it from https://www.python.org/ then run: npm rebuild\n');
  process.exit(0);
}

// 2. Install the Python dependencies into a package-local virtualenv
console.log('\n📦 Installing Python dependencies...');

function run(command, args) {
  const result = spawnSync(command, args, { cwd: packageRoot, stdio: 'inherit', shell: isWindows });
  return result.status === 0;
}

let installed = false;

if (has('uv')) {
  // uv is dramatically faster and creates the venv itself
  installed = run('uv', ['venv', venvPath]) && run('uv', ['pip', 'install', '--python', venvPython, '-e', '.']);
} else {
  installed =
    (fs.existsSync(venvPython) || run(pythonCommand, ['-m', 'venv', venvPath])) &&
    run(venvPython, ['-m', 'pip', 'install', '--quiet', '--upgrade', 'pip']) &&
    run(venvPython, ['-m', 'pip', 'install', '--quiet', '-e', '.']);
}

if (installed && fs.existsSync(venvPython)) {
  console.log('✅ Python dependencies installed into .venv');
} else {
  console.log('⚠️  Could not install the Python dependencies automatically.');
  console.log('   The server will not start until they are available. Install them with:');
  console.log(`     cd "${packageRoot}"`);
  console.log(`     ${pythonCommand} -m venv .venv && .venv/bin/pip install -e .`);
  console.log('   Or run the server through uv instead of npm:');
  console.log('     uvx --from git+https://github.com/isiahw1/mcp-server-bing-webmaster mcp-server-bing-webmaster');
}

console.log('\n📚 Documentation:');
console.log('   https://github.com/isiahw1/mcp-server-bing-webmaster');

console.log('\n🔑 Next Steps:');
console.log('   1. Get your Bing Webmaster API key from https://www.bing.com/webmasters');
console.log('   2. Configure Claude Desktop with your API key');
console.log('   3. Start using powerful Bing Webmaster tools!\n');
