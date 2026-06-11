#!/usr/bin/env node

/**
 * SlideSmith CLI
 *
 * Usage:
 *   slidesmith <input.html> [output.pptx]
 *   slidesmith slides.html                     → saves to ./slides.pptx
 *   slidesmith slides.html -o ~/Desktop/out.pptx
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
    -o, --output    Output file path (default: <input-name>.pptx)
    -q, --quiet     Suppress progress output
    --no-fonts      Skip font embedding (faster, smaller file)
    -h, --help      Show this help
    -v, --version   Show version

  HTML Contract:
    - Mark each slide with class="slide"
    - Recommended: 1920x1080 or 960x540 (16:9)
    - Images: use absolute URLs or base64 data URIs
    - Inline styles recommended for best results

  Examples:
    slidesmith presentation.html
    slidesmith deck.html -o ~/Desktop/deck.pptx
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

// Find input file (first arg that doesn't start with - and isn't -o's value)
const outputFlagIdx = args.findIndex(a => a === '-o' || a === '--output');
let outputFromFlag = null;
if (outputFlagIdx !== -1 && args[outputFlagIdx + 1]) {
  outputFromFlag = args[outputFlagIdx + 1];
}
const positional = args.filter(
  (a, i) => !a.startsWith('-') && (outputFlagIdx === -1 || i !== outputFlagIdx + 1)
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
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n  Done in ${elapsed}s — ${result.slideCount} slide${result.slideCount > 1 ? 's' : ''}\n`);
} catch (err) {
  console.error(`\n  Error: ${err.message}\n`);
  process.exit(1);
}
