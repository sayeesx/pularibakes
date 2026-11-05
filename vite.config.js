import { defineConfig } from 'vite';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const envTarget = process.env.APP_TARGET || process.env.VITE_APP || '';
const vercelProject = process.env.VERCEL_PROJECT_NAME || '';

let targetApp = 'pantry-management';
if (envTarget.toLowerCase() === 'admin' || vercelProject.toLowerCase().includes('admin')) {
  targetApp = 'admin';
}

console.log(`[Root Vite Build] Triggered for target: ${targetApp}`);
execSync(`${npmCmd} --prefix ${targetApp} install`, { stdio: 'inherit' });
execSync(`${npmCmd} --prefix ${targetApp} run build`, { stdio: 'inherit' });

const sourceDist = path.resolve(targetApp, 'dist');
const rootDist = path.resolve('dist');

if (fs.existsSync(rootDist)) {
  fs.rmSync(rootDist, { recursive: true, force: true });
}
fs.cpSync(sourceDist, rootDist, { recursive: true });
console.log(`[Root Vite Build] Done. Populated ./dist`);

process.exit(0);

export default defineConfig({});
