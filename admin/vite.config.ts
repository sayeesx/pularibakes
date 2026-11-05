import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

function getGitCommitHash(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  }
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

function versionPlugin(): Plugin {
  const commitHash = getGitCommitHash();
  const buildTimestamp = Date.now();
  const buildId = commitHash ? `${commitHash}-${buildTimestamp}` : `${buildTimestamp}`;
  const versionData = JSON.stringify(
    {
      buildId,
      commitHash: commitHash || 'unknown',
      builtAt: new Date(buildTimestamp).toISOString(),
    },
    null,
    2
  );

  return {
    name: 'version-plugin',
    config() {
      return {
        define: {
          __APP_BUILD_ID__: JSON.stringify(buildId),
        },
      };
    },
    buildStart() {
      try {
        const publicDir = path.resolve(import.meta.dirname, 'public');
        if (!fs.existsSync(publicDir)) {
          fs.mkdirSync(publicDir, { recursive: true });
        }
        fs.writeFileSync(path.join(publicDir, 'version.json'), versionData, 'utf-8');
      } catch (err) {
        console.warn('Failed to write public/version.json:', err);
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && (req.url === '/version.json' || req.url.startsWith('/version.json?'))) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
          res.end(versionData);
          return;
        }
        next();
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: versionData,
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    versionPlugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-is') || id.includes('scheduler')) {
              return 'vendor-react';
            }
            if (id.includes('@supabase')) {
              return 'vendor-supabase';
            }
            if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) {
              return 'vendor-charts';
            }
            if (id.includes('lucide-react') || id.includes('react-icons')) {
              return 'vendor-icons';
            }
          }
        },
      },
    },
  },
  server: {
    port: 5174,
    host: true,
  },
});
