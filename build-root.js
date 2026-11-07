import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// Detect target application:
// 1. Explicit environment variable: APP_TARGET=admin or APP_TARGET=pantry-management
// 2. Vercel project name: contains "admin" -> admin, else -> pantry-management
const envTarget = (process.env.APP_TARGET || process.env.VITE_APP || '').trim();
const vercelProject = (process.env.VERCEL_PROJECT_NAME || '').trim();

let targetApp = 'pantry-management';

if (envTarget.toLowerCase() === 'admin' || vercelProject.toLowerCase().includes('admin')) {
  targetApp = 'admin';
}

console.log(`=======================================================`);
console.log(` PULARI BAKES MONOREPO ROOT BUILD`);
console.log(` Target Application: ${targetApp}`);
console.log(` Project Name:       ${vercelProject || '(local/not set)'}`);
console.log(`=======================================================`);

// Ensure dependencies are installed in target app
console.log(`[1/3] Ensuring dependencies in ./${targetApp}...`);
execSync(`${npmCmd} --prefix ${targetApp} install`, { stdio: 'inherit' });

// Build target app
console.log(`[2/3] Building ./${targetApp}...`);
execSync(`${npmCmd} --prefix ${targetApp} run build`, { stdio: 'inherit' });

// Copy target build output to root ./dist directory for Vercel
console.log(`[3/3] Copying ./${targetApp}/dist to ./dist...`);
const sourceDist = path.resolve(targetApp, 'dist');
const rootDist = path.resolve('dist');

if (fs.existsSync(rootDist)) {
  fs.rmSync(rootDist, { recursive: true, force: true });
}

fs.cpSync(sourceDist, rootDist, { recursive: true });

console.log(`✓ Build completed successfully. Output ready in ./dist`);

