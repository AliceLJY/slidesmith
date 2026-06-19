/**
 * SlideSmith Core Converter
 *
 * Converts HTML slides to PPTX in two modes:
 *   - editable (default): dom-to-pptx maps the rendered DOM to native PPTX
 *     objects, so text stays text and shapes stay shapes.
 *   - screenshots: each slide is captured as a 2x PNG and placed full-bleed on
 *     its own slide — pixel-perfect but not editable. Used automatically as a
 *     fallback when editable conversion throws, or on demand via
 *     { mode: 'screenshots' }.
 *
 * Shared pipeline for both modes:
 * 1. Local HTTP server to serve HTML + assets (solves image/font path issues)
 * 2. Playwright headless browser to render HTML (real layout engine: flex/grid)
 */

import { chromium } from 'playwright';
import PptxGenJS from 'pptxgenjs';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Slide design size (16:9). Screenshots mode renders at this viewport.
const SLIDE_W = 1920;
const SLIDE_H = 1080;
// PPTX page size in inches for a 16:9 deck (PptxGenJS LAYOUT_WIDE).
const PPTX_W = 13.333;
const PPTX_H = 7.5;

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
 * Convert via dom-to-pptx — fully editable output (text stays text).
 * Throws if the dom-to-pptx bundle is missing or the in-page export fails.
 */
async function convertEditable(inputPath, outputPath, options = {}) {
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
    await page.setViewportSize({ width: SLIDE_W, height: SLIDE_H });

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
      mode: 'editable',
    };
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

/**
 * Convert by screenshotting each slide and placing it full-bleed on a PPTX
 * slide. Pixel-perfect but NOT editable. No dom-to-pptx dependency, so this
 * also works as a fallback when editable conversion fails (e.g. exotic CSS
 * the editable path can't translate).
 */
async function convertViaScreenshots(inputPath, outputPath, options = {}) {
  const { quiet = false, scale = 2, _fellBack = false } = options;
  const log = quiet ? () => {} : console.log;

  const resolvedInput = path.resolve(inputPath);
  if (!fs.existsSync(resolvedInput)) {
    throw new Error(`File not found: ${resolvedInput}`);
  }

  const htmlDir = path.dirname(resolvedInput);
  const server = await startServer(htmlDir);
  const port = server.address().port;
  log(`  Local server on :${port}`);

  let browser;
  try {
    browser = await launchBrowser();
    // deviceScaleFactor for crisp output: render at 2x, downscale later.
    const context = await browser.newContext({
      viewport: { width: SLIDE_W, height: SLIDE_H },
      deviceScaleFactor: scale,
    });
    const page = await context.newPage();

    const htmlFileName = path.basename(resolvedInput);
    log(`  Loading ${htmlFileName} (screenshots mode, ${scale}x)`);
    await page.goto(
      `http://127.0.0.1:${port}/${encodeURIComponent(htmlFileName)}`,
      { waitUntil: 'networkidle', timeout: 30000 }
    );
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Collect slide element handles (same contract as editable: class="slide")
    let targets = await page.$$('.slide');
    if (targets.length === 0) {
      const first = await page.$('body > *');
      targets = first ? [first] : [await page.$('body')];
      const topLevelCount = await page.evaluate(() => document.body.childElementCount);
      if (topLevelCount > 1) {
        console.warn(
          `  Warning: no class="slide" markers; only the first of ${topLevelCount} top-level elements will be captured.\n` +
          '  Mark each slide with class="slide" to capture them all.'
        );
      }
    }
    log(`  Found ${targets.length} slide${targets.length > 1 ? 's' : ''}`);

    // Build a 16:9 deck, one full-bleed image per slide.
    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: 'SS_16x9', width: PPTX_W, height: PPTX_H });
    pptx.layout = 'SS_16x9';

    log('  Capturing...');
    for (let i = 0; i < targets.length; i++) {
      const el = targets[i];
      if (!el) continue;
      await el.scrollIntoViewIfNeeded().catch(() => {});
      const buf = await el.screenshot({ type: 'png' });
      const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
      const slide = pptx.addSlide();
      slide.addImage({ data: dataUrl, x: 0, y: 0, w: PPTX_W, h: PPTX_H });
    }

    const resolvedOutput = path.resolve(outputPath);
    const dir = path.dirname(resolvedOutput);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await pptx.writeFile({ fileName: resolvedOutput });

    const fileSize = fs.statSync(resolvedOutput).size;
    const sizeMB = (fileSize / 1024 / 1024).toFixed(2);
    log(`  Saved: ${resolvedOutput} (${sizeMB} MB)`);

    return {
      slideCount: targets.length || 1,
      fileSize,
      outputPath: resolvedOutput,
      mode: 'screenshots',
      fellBack: _fellBack,
    };
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

/**
 * Convert an HTML file to PPTX.
 *
 * @param {string} inputPath - Path to HTML file
 * @param {string} outputPath - Path for output PPTX file
 * @param {object} [options] - Conversion options
 * @param {'editable'|'screenshots'} [options.mode='editable'] - Conversion mode
 * @param {boolean} [options.fallback=true] - In editable mode, fall back to
 *   screenshots if editable conversion throws
 * @param {boolean} [options.quiet=false] - Suppress console output
 * @param {boolean} [options.autoEmbedFonts=true] - Embed fonts (editable mode)
 * @param {number} [options.scale=2] - Device scale factor (screenshots mode)
 * @returns {Promise<{slideCount:number, fileSize:number, outputPath:string, mode:string, fellBack?:boolean}>}
 */
export async function convert(inputPath, outputPath, options = {}) {
  const { mode = 'editable', fallback = true, quiet = false } = options;
  const log = quiet ? () => {} : console.log;

  if (mode === 'screenshots') {
    return convertViaScreenshots(inputPath, outputPath, options);
  }

  // editable (default), with automatic screenshots fallback
  try {
    return await convertEditable(inputPath, outputPath, options);
  } catch (err) {
    if (!fallback) throw err;
    console.warn(`  ⚠ Editable conversion failed: ${err.message}`);
    log('    Falling back to screenshots mode (pixel-perfect, not editable)...');
    return convertViaScreenshots(inputPath, outputPath, { ...options, _fellBack: true });
  }
}

// Also expose the concrete modes for programmatic callers that want to be explicit.
export { convertEditable, convertViaScreenshots };
