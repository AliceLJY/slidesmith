#!/usr/bin/env node

/**
 * SlideSmith CLI
 *
 * Usage:
 *   slidesmith <input.html> [output.pptx]
 *   slidesmith slides.html                     → saves to ./slides.pptx
 *   slidesmith slides.html -o ~/Desktop/out.pptx
 *   slidesmith slides.html --screenshots       → pixel-perfect, not editable
 *   slidesmith --help
 */

import path from 'path';
import { convert } from '../lib/converter.mjs';

// --- Parse args ---
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.log(`
  SlideSmith - Forge editable PowerPoint from HTML

  Usage:
    slidesmith <input.html> [output.pptx]
    slidesmith <input.html> -o <output.pptx>

  Options:
    -o, --output       Output file path (default: <input-name>.pptx)
    --mode <mode>      'editable' (default) or 'screenshots'
    --screenshots      Shorthand for --mode screenshots (pixel-perfect, not editable)
    --no-fallback      Fail instead of falling back to screenshots when editable conversion fails
    -q, --quiet        Suppress progress output
    --no-fonts         Skip font embedding (faster, smaller file; editable mode)
    -h, --help         Show this help
    -v, --version      Show version

  Modes:
    editable     (default) Text stays text, shapes stay shapes — fully editable
                 in PowerPoint/Keynote. Falls back to screenshots automatically
                 if the deck uses CSS the editable path can't translate.
    screenshots  Each slide captured as a 2x image, placed full-bleed. Pixel-
                 perfect but not editable. Use for decks with exotic CSS.

  HTML Contract:
    - Mark each slide with class="slide"
    - Recommended: 1920x1080 or 960x540 (16:9)
    - Images: relative paths (inside the HTML file's directory),
      absolute URLs, or base64 data URIs
    - Inline styles recommended for best results

  Examples:
    slidesmith presentation.html
    slidesmith deck.html -o ~/Desktop/deck.pptx
    slidesmith deck.html --screenshots
    node bin/cli.mjs my-slides.html

  Powered by dom-to-pptx & PptxGenJS
`);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  const pkg = require('../package.json');
  console.log(`slidesmith v${pkg.version}`);
  process.exit(0);
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

let quiet = false;
let noFonts = false;
let noFallback = false;
let screenshots = false;
let explicitMode = null;
let outputFromFlag = null;
const positional = [];

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--') {
    positional.push(...args.slice(i + 1));
    break;
  }
  if (arg === '-q' || arg === '--quiet') quiet = true;
  else if (arg === '--no-fonts') noFonts = true;
  else if (arg === '--no-fallback') noFallback = true;
  else if (arg === '--screenshots') screenshots = true;
  else if (arg === '--mode') {
    const value = args[i + 1];
    if (!value || value.startsWith('-')) fail('--mode needs a value');
    if (value !== 'editable' && value !== 'screenshots') {
      fail(`--mode must be 'editable' or 'screenshots' (got '${value}').`);
    }
    explicitMode = value;
    i += 1;
  } else if (arg === '-o' || arg === '--output') {
    const value = args[i + 1];
    if (!value || value.startsWith('-')) fail(`${arg} needs a value`);
    if (outputFromFlag !== null) fail('output option specified more than once');
    outputFromFlag = value;
    i += 1;
  } else if (arg.startsWith('-')) {
    fail(`unknown option: ${arg}`);
  } else {
    positional.push(arg);
  }
}

const mode = explicitMode ?? (screenshots ? 'screenshots' : 'editable');

const inputFile = positional[0];
if (!inputFile) {
  fail('No input file specified. Run "slidesmith --help" for usage.');
}
const allowedPositionals = outputFromFlag ? 1 : 2;
if (positional.length > allowedPositionals) {
  fail(`unexpected extra arguments: ${positional.slice(allowedPositionals).join(', ')}`);
}

// Determine output path
let outputFile;
if (outputFromFlag) {
  outputFile = outputFromFlag;
} else if (positional[1]) {
  outputFile = positional[1];
} else {
  // Default: same name, .pptx extension, in current directory
  outputFile = path.join(
    process.cwd(),
    path.basename(inputFile, path.extname(inputFile)) + '.pptx'
  );
}

// --- Run conversion ---
const log = quiet ? () => {} : console.log;
log(`\n  SlideSmith\n`);
const startTime = Date.now();

try {
  const result = await convert(inputFile, outputFile, {
    quiet,
    autoEmbedFonts: !noFonts,
    mode,
    fallback: !noFallback,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const plural = result.slideCount > 1 ? 's' : '';
  let modeNote = '';
  if (result.mode === 'screenshots') {
    modeNote = result.fellBack
      ? ' — screenshots (editable failed, fell back; not editable)'
      : ' — screenshots (not editable)';
  }
  log(`\n  Done in ${elapsed}s — ${result.slideCount} slide${plural}${modeNote}\n`);
} catch (err) {
  console.error(`\n  Error: ${err.message}\n`);
  process.exit(1);
}
