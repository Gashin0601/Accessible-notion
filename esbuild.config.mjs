import * as esbuild from 'esbuild';
import { existsSync, mkdirSync, copyFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const isWatch = process.argv.includes('--watch');

/** Copy static files to dist */
function copyStaticFiles() {
  const distDir = 'dist';
  if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });

  // Copy manifest
  copyFileSync('src/manifest.json', join(distDir, 'manifest.json'));

  // Copy icons
  const iconsDir = join(distDir, 'icons');
  if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });
  const srcIcons = 'extension/icons';
  if (existsSync(srcIcons)) {
    for (const file of readdirSync(srcIcons)) {
      copyFileSync(join(srcIcons, file), join(iconsDir, file));
    }
  }

  // Copy guide page
  const guideDir = join(distDir, 'guide');
  if (!existsSync(guideDir)) mkdirSync(guideDir, { recursive: true });
  copyFileSync('src/guide/guide.html', join(guideDir, 'guide.html'));

  // Copy _locales
  const srcLocales = 'src/_locales';
  if (existsSync(srcLocales)) {
    copyLocalesDir(srcLocales, join(distDir, '_locales'));
  }
}

function copyLocalesDir(src, dest) {
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyLocalesDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

/** Plugin to write reload timestamp after each build */
const reloadTimestampPlugin = {
  name: 'reload-timestamp',
  setup(build) {
    build.onEnd(() => {
      const distDir = 'dist';
      if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });
      writeFileSync(join(distDir, 'reload.txt'), String(Date.now()));
      if (isWatch) {
        console.log(`Rebuild complete (${new Date().toLocaleTimeString()})`);
      }
    });
  },
};

const buildOptions = {
  entryPoints: [
    'src/content/main.ts',
    'src/content/dom-bridge.ts',
    'src/background/service-worker.ts',
  ],
  bundle: true,
  outdir: 'dist',
  format: 'iife',
  target: 'chrome120',
  sourcemap: isWatch ? 'inline' : false,
  minify: !isWatch,
  plugins: [reloadTimestampPlugin],
};

copyStaticFiles();

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(buildOptions);
  console.log('Build complete.');
}
