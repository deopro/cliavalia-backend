#!/usr/bin/env node
/**
 * Start script that ensures dist directory exists before starting Strapi (production only).
 * When NODE_ENV is not "production", runs strapi develop so content-type editing is enabled locally.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { spawn } = require('child_process');

const appRoot = path.join(__dirname, '..');
const distPath = path.join(appRoot, 'dist');
const isProduction = process.env.NODE_ENV === 'production';

// Locally: use development mode so content-type editing is enabled
if (!isProduction) {
  console.log('🔵 [START] NODE_ENV is not production — running in development mode (strapi develop)');
  console.log('🔵 [START] Content-type editing is enabled.');
  const strapiProcess = spawn('npx', ['strapi', 'develop'], {
    stdio: 'inherit',
    cwd: appRoot,
    shell: true,
    env: { ...process.env, NODE_ENV: 'development' }
  });
  strapiProcess.on('error', (error) => {
    console.error('❌ [START] Failed to spawn Strapi process:', error);
    process.exit(1);
  });
  strapiProcess.on('exit', (code, signal) => {
    if (signal) {
      console.log(`🔵 [START] Strapi process killed by signal: ${signal}`);
    } else if (code !== 0 && code !== null) {
      console.error(`❌ [START] Strapi exited with error code: ${code}`);
      process.exit(code);
    } else {
      process.exit(0);
    }
  });
  process.on('SIGTERM', () => strapiProcess.kill('SIGTERM'));
  process.on('SIGINT', () => strapiProcess.kill('SIGINT'));
  return;
}

// Production: ensure dist exists, then strapi start
console.log('🔵 [START] Checking for dist directory...');
console.log('🔵 [START] App root:', appRoot);
console.log('🔵 [START] Dist path:', distPath);
console.log('🔵 [START] Dist exists:', fs.existsSync(distPath));

if (!fs.existsSync(distPath)) {
  console.log('⚠️  [START] dist directory not found, running build...');
  try {
    console.log('🔵 [START] Executing: npm run build');
    execSync('npm run build', {
      stdio: 'inherit',
      cwd: appRoot,
      env: { ...process.env, NODE_ENV: 'production' }
    });

    if (!fs.existsSync(distPath)) {
      throw new Error('Build completed but dist directory still not found');
    }
    console.log('✅ [START] Build completed successfully');
  } catch (error) {
    console.error('❌ [START] Build failed:', error.message);
    console.error('❌ [START] Error details:', error);
    process.exit(1);
  }
} else {
  console.log('✅ [START] dist directory found');
}

console.log('🔵 [START] Starting Strapi (production)...');

if (!fs.existsSync(distPath)) {
  console.error('❌ [START] FATAL: dist directory still does not exist after build attempt');
  process.exit(1);
}

const strapiProcess = spawn('npx', ['strapi', 'start'], {
  stdio: 'inherit',
  cwd: appRoot,
  shell: true,
  env: process.env
});

strapiProcess.on('error', (error) => {
  console.error('❌ [START] Failed to spawn Strapi process:', error);
  process.exit(1);
});

strapiProcess.on('exit', (code, signal) => {
  if (signal) {
    console.log(`🔵 [START] Strapi process killed by signal: ${signal}`);
  } else if (code !== 0 && code !== null) {
    console.error(`❌ [START] Strapi exited with error code: ${code}`);
    process.exit(code);
  } else {
    console.log('🔵 [START] Strapi process exited normally');
    process.exit(0);
  }
});

// Handle process termination signals
process.on('SIGTERM', () => {
  console.log('🔵 [START] Received SIGTERM, shutting down gracefully...');
  strapiProcess.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('🔵 [START] Received SIGINT, shutting down gracefully...');
  strapiProcess.kill('SIGINT');
});
