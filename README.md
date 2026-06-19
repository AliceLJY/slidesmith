# SlideSmith

**Forge editable PowerPoint files from HTML slides.**

One command turns your HTML + CSS into a fully editable `.pptx` file — text stays as text, shapes stay as shapes, gradients and shadows are preserved. No cloud upload, no slide limits, no cost.

```bash
git clone https://github.com/AliceLJY/slidesmith.git && cd slidesmith && npm install
node bin/cli.mjs presentation.html
```

> **Run it locally** — clone and run, no npm install needed. (The npm name `slidesmith` belongs to an unrelated package, so don't `npm i slidesmith`.)

## Why?

| | SlideSmith | SaaS converters | Screenshot-to-PPT |
|---|---|---|---|
| Editable text | Yes | Yes | No (images) |
| Slide limit | Unlimited | 5-50 | Unlimited |
| Cost | Free | $10-100/mo | Free |
| Data privacy | 100% local | Cloud upload | 100% local |
| CSS support | Flexbox, Grid, Gradients | Varies | Everything |

## How it works

1. **Local HTTP server** serves your HTML and assets (images, fonts)
2. **Headless browser** (Playwright) renders the HTML using a real layout engine
3. **[dom-to-pptx](https://github.com/atharva9167j/dom-to-pptx)** traverses the rendered DOM, reads computed positions and styles, and maps each element to a native PPTX object via [PptxGenJS](https://github.com/gitbrent/PptxGenJS)
4. Output: a real `.pptx` file you can edit in PowerPoint, Keynote, or Google Slides

The key insight: the browser's layout engine handles all the hard work (flexbox, grid, absolute positioning). We just read the final computed positions.

**Two modes.** By default SlideSmith produces **editable** output (text stays text). For decks with exotic CSS the editable path can't translate, pass `--screenshots` to capture each slide as a pixel-perfect (non-editable) 2x image instead. And if editable conversion ever throws, SlideSmith falls back to screenshots automatically — so you never get an empty file.

## Quick start

### Clone and run

```bash
git clone https://github.com/AliceLJY/slidesmith.git
cd slidesmith
npm install
node bin/cli.mjs my-slides.html
```

> Want a short `slidesmith` command? Run `npm link` once inside the repo — it symlinks a local `slidesmith` you can call from anywhere. Nothing is published to npm; the commands below assume you've done this (otherwise use `node bin/cli.mjs`).

### First-time setup

SlideSmith tries to use your system Chrome first. If no browser is available:

```bash
npx playwright install chromium
```

## Usage

```bash
# Basic — outputs my-slides.pptx in current directory
slidesmith my-slides.html

# Custom output path
slidesmith deck.html -o ~/Desktop/presentation.pptx

# Skip font embedding (faster, smaller file)
slidesmith deck.html --no-fonts

# Screenshots mode — pixel-perfect, not editable (for decks with exotic CSS)
slidesmith deck.html --screenshots

# Quiet mode
slidesmith deck.html -q
```

## HTML contract

Mark each slide with `class="slide"` and give it explicit dimensions:

```html
<div class="slide" style="width: 1920px; height: 1080px; padding: 80px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  font-family: Arial, sans-serif; color: white;
  display: flex; flex-direction: column; justify-content: center;">

  <h1 style="font-size: 72px;">Your title here</h1>
  <p style="font-size: 28px; margin-top: 20px;">This text is editable in PowerPoint.</p>
</div>
```

### Supported CSS

- **Layout**: `display: flex`, `display: grid`, `position: absolute/relative`, `gap`
- **Background**: `background-color`, `linear-gradient()`, `background-image` (URL/base64)
- **Borders**: `border`, `border-radius` (including per-corner)
- **Shadows**: `box-shadow` (single and multiple)
- **Typography**: `font-family`, `font-size`, `font-weight`, `color`, `text-align`, `line-height`, `letter-spacing`
- **Transform**: `rotate()` (translate/scale not supported)
- **Other**: `opacity`, `padding`, `filter: blur()`

### Images

Relative paths, absolute URLs, and base64 data URIs all work. Relative paths resolve against the HTML file's directory (a local server serves it during conversion), so keep referenced assets in that directory or below:

```html
<!-- All of these work -->
<img src="./photo.jpg" />
<img src="assets/logo.png" />
<img src="https://example.com/photo.jpg" style="width: 400px; border-radius: 16px;" />
<img src="data:image/png;base64,..." />

<!-- Won't work: outside the HTML file's directory -->
<img src="../elsewhere/photo.jpg" />
```

### Security note

**Only convert HTML you trust.** SlideSmith renders your HTML in a real headless browser and executes its scripts with network access. Don't feed it untrusted pages.

### Multiple slides

```html
<div class="slide" style="width: 1920px; height: 1080px;">
  <h1>Slide 1</h1>
</div>

<div class="slide" style="width: 1920px; height: 1080px;">
  <h1>Slide 2</h1>
</div>
```

## Examples

The `examples/` directory includes ready-to-use templates:

- **`minimal.html`** — Single slide, simplest possible input
- **`pitch-deck.html`** — 5-slide pitch deck with gradients, cards, and tables
- **`data-dashboard.html`** — KPI cards and CSS-only bar charts

Try them:

```bash
node bin/cli.mjs examples/pitch-deck.html -o pitch-deck.pptx
```

## Programmatic API

```javascript
import { convert } from './lib/converter.mjs';

const result = await convert('slides.html', 'output.pptx', {
  quiet: false,
  autoEmbedFonts: true,
  mode: 'editable',   // or 'screenshots' (pixel-perfect, not editable)
  fallback: true,     // auto-fall back to screenshots if editable conversion fails
});

console.log(`${result.slideCount} slides, ${result.fileSize} bytes`);
```

## Acknowledgments

SlideSmith is a thin CLI wrapper. The heavy lifting is done by:

- **[dom-to-pptx](https://github.com/atharva9167j/dom-to-pptx)** — DOM traversal and PPTX element mapping
- **[PptxGenJS](https://github.com/gitbrent/PptxGenJS)** — PowerPoint file generation
- **[Playwright](https://playwright.dev/)** — Headless browser rendering

## License

[MIT](LICENSE)
