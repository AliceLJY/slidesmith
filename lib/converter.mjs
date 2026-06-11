/**
 * SlideSmith Core Converter
 *
 * Converts HTML slides to editable PPTX using:
 * 1. Local HTTP server to serve HTML + assets (solves image/font path issues)
 * 2. Playwright headless browser to render HTML (leverages browser layout engine for flexbox/grid)
 * 3. dom-to-pptx injected into the page to traverse DOM and map elements to native PPTX objects
 *
 * Result: fully editable PowerPoint — text is text, not screenshots.
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Locate dom-to-pptx bundle
function findBundle() {
  // Method 1: resolve the main entry and navigate to dist/
  try {
    const mainPath = require.resolve('dom-to-pptx');
    const distDir = path.dirname(mainPath);
    const bundlePath = path.join(distDir, 'dom-to-pptx.bundle.js');
    if (fs.existsSync(bundlePath)) return bundlePath;
  } catch { /* continue */ }

  // Method 2: walk up from this file to find node_modules
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, 'node_modules', 'dom-to-pptx', 'dist', 'dom-to-pptx.bundle.js');
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }

  return null;
}

// MIME types for local server
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.json': 'application/json',
};

/**
 * Start a local HTTP server to serve the HTML file and its assets.
 * This solves CORS and relative path issues.
 */
function startServer(baseDir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const reqPath = decodeURIComponent(url.pathname);
      const filePath = path.join(baseDir, reqPath);

      // Security: don't serve files outside baseDir
      if (filePath !== baseDir && !filePath.startsWith(baseDir + path.sep)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      try {
        const content = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

/**
 * Launch a browser, trying system Chrome first, then Playwright's bundled Chromium.
 */
async function launchBrowser() {
  // Try system Chrome first (no download needed)
  for (const channel of ['chrome', 'msedge', undefined]) {
    try {
      const opts = { headless: true };
      if (channel) opts.channel = channel;
      return await chromium.launch(opts);
    } catch {
      continue;
    }
  }

  throw new Error(
    'No browser found.\n' +
    '  Option 1: Install Chrome or Edge\n' +
    '  Option 2: Run "npx playwright install chromium"'
  );
}

/**
 * Convert an HTML file to PPTX.
 *
 * @param {string} inputPath - Path to HTML file
 * @param {string} outputPath - Path for output PPTX file
 * @param {object} [options] - Conversion options
 * @param {boolean} [options.quiet=false] - Suppress console output
 * @param {boolean} [options.autoEmbedFonts=true] - Embed fonts in PPTX
 * @returns {Promise<{slideCount: number, fileSize: number, outputPath: string}>}
 */
export async function convert(inputPath, outputPath, options = {}) {
  const { quiet = false, autoEmbedFonts = true } = options;
  const log = quiet ? () => {} : console.log;

  const resolvedInput = path.resolve(inputPath);
  if (!fs.existsSync(resolvedInput)) {
    throw new Error(`File not found: ${resolvedInput}`);
  }

  // Find dom-to-pptx bundle
  const bundlePath = findBundle();
  if (!bundlePath || !fs.existsSync(bundlePath)) {
    throw new Error(
      'dom-to-pptx bundle not found.\n' +
      '  Run: npm install dom-to-pptx'
    );
  }
  const bundleScript = fs.readFileSync(bundlePath, 'utf-8');

  // Start local server
  const htmlDir = path.dirname(resolvedInput);
  const server = await startServer(htmlDir);
  const port = server.address().port;
  log(`  Local server on :${port}`);

  let browser;
  try {
    // Launch browser
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Load HTML
    const htmlFileName = path.basename(resolvedInput);
    log(`  Loading ${htmlFileName}`);
    await page.goto(
      `http://127.0.0.1:${port}/${encodeURIComponent(htmlFileName)}`,
      { waitUntil: 'networkidle', timeout: 30000 }
    );

    // Wait for assets
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Inject dom-to-pptx
    await page.addScriptTag({ content: bundleScript });

    // Detect slides
    const slideCount = await page.evaluate(() =>
      document.querySelectorAll('.slide').length
    );
    log(`  Found ${slideCount || '0 (using body)'} slides`);
    if (slideCount === 0) {
      const topLevelCount = await page.evaluate(() => document.body.childElementCount);
      if (topLevelCount > 1) {
        console.warn(
          `  Warning: no class="slide" markers; only the first of ${topLevelCount} top-level elements will be converted.\n` +
          '  Mark each slide with class="slide" to convert them all.'
        );
      }
    }

    // Convert
    log('  Converting...');
    page.setDefaultTimeout(120000);
    const base64 = await page.evaluate(
      async (embedFonts) => {
        const slides = document.querySelectorAll('.slide');
        const elements = slides.length > 0
          ? Array.from(slides)
          : [document.body.firstElementChild || document.body];

        const blob = await window.domToPptx.exportToPptx(elements, {
          skipDownload: true,
          autoEmbedFonts: embedFonts,
        });

        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = () => reject(new Error('Failed to read blob'));
          reader.readAsDataURL(blob);
        });
      },
      autoEmbedFonts
    );

    // Save
    const resolvedOutput = path.resolve(outputPath);
    const dir = path.dirname(resolvedOutput);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const buffer = Buffer.from(base64, 'base64');
    fs.writeFileSync(resolvedOutput, buffer);

    const fileSize = buffer.length;
    const sizeMB = (fileSize / 1024 / 1024).toFixed(2);
    log(`  Saved: ${resolvedOutput} (${sizeMB} MB)`);

    return {
      slideCount: slideCount || 1,
      fileSize,
      outputPath: resolvedOutput,
    };
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}
