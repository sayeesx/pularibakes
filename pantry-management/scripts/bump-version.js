import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const pkgPath = path.join(rootDir, 'package.json');
const versionPath = path.join(rootDir, 'public', 'version.json');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const currentVersion = pkg.version || '1.0.0';

// Increment patch version: 1.0.0 -> 1.0.1
const parts = currentVersion.split('.').map(Number);
parts[2] = (parts[2] || 0) + 1;
const newVersion = parts.join('.');

pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

// Try to get latest git commit
let commitHash = 'latest';
try {
  commitHash = execSync('git rev-parse --short HEAD', { cwd: rootDir, encoding: 'utf8' }).trim();
} catch (e) {
  commitHash = Math.random().toString(36).substring(2, 9);
}

const versionData = {
  version: newVersion,
  commit: commitHash,
  builtAt: new Date().toISOString(),
};

fs.writeFileSync(versionPath, JSON.stringify(versionData, null, 2) + '\n', 'utf8');

console.log(`[Version Bumper] Updated to v${newVersion} (commit: ${commitHash})`);
