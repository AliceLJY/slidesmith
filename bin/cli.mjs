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
    - Images: use absolute URLs or base64 data URIs
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

// Extract options
const quiet = args.includes('-q') || args.includes('--quiet');
const noFonts = args.includes('--no-fonts');
const noFallback = args.includes('--no-fallback');

// Mode resolution: --screenshots is shorthand; --mode <m> is explicit and wins.
let mode = args.includes('--screenshots') ? 'screenshots' : 'editable';
const modeFlagIdx = args.findIndex((a) => a === '--mode');
if (modeFlagIdx !== -1) {
  const m = args[modeFlagIdx + 1];
  if (m !== 'editable' && m !== 'screenshots') {
    console.error(`Error: --mode must be 'editable' or 'screenshots' (got '${m ?? ''}').`);
    process.exit(1);
  }
  mode = m;
}

// Find input/output, skipping values that belong to -o/--output and --mode.
const valueIdxs = new Set();
for (const flag of ['-o', '--output', '--mode']) {
  const i = args.indexOf(flag);
  if (i !== -1) valueIdxs.add(i + 1);
}
const outputFlagIdx = args.findIndex((a) => a === '-o' || a === '--output');
const outputFromFlag = outputFlagIdx !== -1 ? args[outputFlagIdx + 1] : null;

const positional = args.filter(
  (a, i) => !a.startsWith('-') && !valueIdxs.has(i)
);

const inputFile = positional[0];
if (!inputFile) {
  console.error('Error: No input file specified. Run "slidesmith --help" for usage.');
  process.exit(1);
}

// Determine output path
let outputFile;
if (outputFromFlag) {
  outputFile = outputFromFlag;
} else if (positional[1] && positional[1] !== inputFile) {
  outputFile = positional[1];
} else {
  // Default: same name, .pptx extension, in current directory
  outputFile = path.join(
    process.cwd(),
    path.basename(inputFile, path.extname(inputFile)) + '.pptx'
  );
}

// --- Run conversion ---
console.log(`\n  SlideSmith\n`);
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
  console.log(`\n  Done in ${elapsed}s — ${result.slideCount} slide${plural}${modeNote}\n`);
} catch (err) {
  console.error(`\n  Error: ${err.message}\n`);
  process.exit(1);
}
