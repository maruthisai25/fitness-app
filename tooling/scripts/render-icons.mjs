#!/usr/bin/env node
/**
 * Rasterises the VigorEngine mark (`tooling/assets/vigor-mark.svg`) into every
 * icon both shells need, so there is exactly one place the brand is drawn.
 *
 *   node tooling/scripts/render-icons.mjs [--check]
 *
 * `--check` re-renders nothing and only verifies that every target exists with
 * the expected pixel dimensions — useful in CI once the PNGs are committed.
 *
 * Colours come from `packages/ui-tokens` (DESIGN.md §7.5) and are duplicated
 * here as literals on purpose: this script is plain Node with no build step, and
 * the tokens package is TypeScript. `assertTokensInSync()` reads the tokens file
 * and fails loudly if the two ever drift.
 */

import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MARK_SVG = join(REPO_ROOT, 'tooling', 'assets', 'vigor-mark.svg');
const TOKENS_TS = join(REPO_ROOT, 'packages', 'ui-tokens', 'src', 'index.ts');

/** `darkPalette.bg` — the deep green-black ground. */
const GROUND = '#0B1210';
/** `darkPalette.accent` — burnt amber. */
const ACCENT = '#C4711F';
/** `darkPalette.accentPressed`. */
const ACCENT_PRESSED = '#A65C14';

/** The mark's own viewBox; every composition happens in this coordinate space. */
const VIEWBOX = 512;

/**
 * One raster target.
 *
 * `scale` shrinks the mark about the canvas centre so the drawn pixels land
 * inside the platform's safe zone:
 *   - 1.00 full bleed — the mark already sits at 60 % of the box
 *   - 0.78 maskable — keeps every pixel inside the inner 80 % circle a mask may
 *     crop to (worst case is the corner of the drawn bounding box, not its edge)
 *   - 0.62 Android adaptive foreground — the inner 66 dp of the 108 dp canvas
 *   - 0.55 splash — the mark reads as a logo, not a wallpaper
 *
 * `background` of `null` renders transparent, which is what an adaptive
 * foreground and an Expo splash image both require (the ground colour is
 * supplied by `app.json` instead).
 *
 * @type {ReadonlyArray<{ file: string; size: number; scale: number; background: string | null; note: string }>}
 */
const TARGETS = [
  {
    file: 'apps/web/public/icons/icon-192.png',
    size: 192,
    scale: 1,
    background: GROUND,
    note: 'PWA manifest icon, purpose "any"',
  },
  {
    file: 'apps/web/public/icons/icon-512.png',
    size: 512,
    scale: 1,
    background: GROUND,
    note: 'PWA manifest icon, purpose "any"',
  },
  {
    file: 'apps/web/public/icons/maskable-512.png',
    size: 512,
    scale: 0.78,
    background: GROUND,
    note: 'PWA manifest icon, purpose "maskable" (safe-zone padded)',
  },
  {
    file: 'apps/web/public/icons/apple-touch-icon-180.png',
    size: 180,
    scale: 0.92,
    background: GROUND,
    note: 'iOS home-screen icon (iOS applies its own corner mask)',
  },
  {
    file: 'apps/mobile/assets/icon.png',
    size: 1024,
    scale: 1,
    background: GROUND,
    note: 'Expo app icon',
  },
  {
    file: 'apps/mobile/assets/adaptive-icon.png',
    size: 1024,
    scale: 0.62,
    background: null,
    note: 'Android adaptive-icon foreground (transparent, 66 % safe zone)',
  },
  {
    file: 'apps/mobile/assets/splash-icon.png',
    size: 1024,
    scale: 0.55,
    background: null,
    note: 'Expo splash image (transparent, drawn on splash backgroundColor)',
  },
  {
    file: 'apps/mobile/assets/favicon.png',
    size: 64,
    scale: 1,
    background: GROUND,
    note: 'Expo web favicon',
  },
];

/** The one vector output. Written from the same source, not rasterised. */
const FAVICON_SVG = 'apps/web/public/icons/favicon.svg';

/**
 * Fails the build if the literals above drift from `packages/ui-tokens`.
 *
 * @param {string} tokensSource
 */
function assertTokensInSync(tokensSource) {
  /** @type {ReadonlyArray<[string, string]>} */
  const expected = [
    ['bg', GROUND],
    ['accent', ACCENT],
    ['accentPressed', ACCENT_PRESSED],
  ];
  // `darkPalette` is the first palette literal in the file; read each token from
  // the slice that belongs to it so `lightPalette` cannot satisfy the check.
  const darkStart = tokensSource.indexOf('export const darkPalette');
  const darkEnd = tokensSource.indexOf('export const lightPalette');
  if (darkStart === -1 || darkEnd === -1 || darkEnd < darkStart) {
    throw new Error(`Could not locate darkPalette in ${relative(REPO_ROOT, TOKENS_TS)}`);
  }
  const dark = tokensSource.slice(darkStart, darkEnd);
  for (const [token, value] of expected) {
    const match = new RegExp(`\\b${token}:\\s*'(#[0-9A-Fa-f]{6})'`).exec(dark);
    if (!match) throw new Error(`ui-tokens darkPalette has no "${token}"`);
    if (match[1].toUpperCase() !== value.toUpperCase()) {
      throw new Error(
        `Brand drift: ui-tokens darkPalette.${token} is ${match[1]} but ` +
          `render-icons.mjs uses ${value}. Update this script.`,
      );
    }
  }
}

/**
 * Lifts `<g id="mark"> … </g>` out of the source SVG.
 *
 * @param {string} svgSource
 * @returns {string}
 */
function extractMarkGroup(svgSource) {
  // Strip comments first: the source SVG documents itself, and prose that
  // mentions the group would otherwise be matched as markup.
  const withoutComments = svgSource.replace(/<!--[\s\S]*?-->/g, '');
  const match = /<g id="mark">([\s\S]*?)<\/g>/.exec(withoutComments);
  if (!match) {
    throw new Error(`${relative(REPO_ROOT, MARK_SVG)} is missing its <g id="mark"> group`);
  }
  return match[1].trim();
}

/**
 * Composes a standalone SVG document at the mark's own 512 coordinate space.
 *
 * @param {object} options
 * @param {string} options.markGroup
 * @param {number} options.size            rendered px (also the SVG width/height)
 * @param {number} options.scale           1 = full bleed
 * @param {string | null} options.background
 * @param {number} [options.cornerRadius]  rounds the background, for favicon.svg
 * @returns {string}
 */
function composeSvg({ markGroup, size, scale, background, cornerRadius = 0 }) {
  const centre = VIEWBOX / 2;
  const ground =
    background === null
      ? ''
      : `\n  <rect width="${VIEWBOX}" height="${VIEWBOX}" rx="${cornerRadius}" fill="${background}" />`;
  const transform =
    scale === 1
      ? ''
      : ` transform="translate(${centre} ${centre}) scale(${scale}) translate(${-centre} ${-centre})"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" width="${size}" height="${size}">${ground}
  <g${transform}>
    ${markGroup.split('\n').join('\n    ')}
  </g>
</svg>
`;
}

/**
 * @param {string} repoRelative
 * @returns {Promise<{ width: number; height: number }>}
 */
async function dimensionsOf(repoRelative) {
  const meta = await sharp(join(REPO_ROOT, repoRelative)).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

async function main() {
  const check = process.argv.includes('--check');

  const [svgSource, tokensSource] = await Promise.all([
    readFile(MARK_SVG, 'utf8'),
    readFile(TOKENS_TS, 'utf8'),
  ]);
  assertTokensInSync(tokensSource);
  const markGroup = extractMarkGroup(svgSource);

  if (!check) {
    for (const target of TARGETS) {
      const outPath = join(REPO_ROOT, target.file);
      await mkdir(dirname(outPath), { recursive: true });
      const svg = composeSvg({
        markGroup,
        size: target.size,
        scale: target.scale,
        background: target.background,
      });
      await sharp(Buffer.from(svg, 'utf8'), { density: 384 })
        .resize(target.size, target.size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png({ compressionLevel: 9, palette: true })
        .toFile(outPath);
    }

    const faviconPath = join(REPO_ROOT, FAVICON_SVG);
    await mkdir(dirname(faviconPath), { recursive: true });
    await writeFile(
      faviconPath,
      composeSvg({ markGroup, size: 512, scale: 0.86, background: GROUND, cornerRadius: 96 }),
      'utf8',
    );
  }

  /** @type {string[]} */
  const failures = [];
  const rows = [];
  for (const target of TARGETS) {
    const { width, height } = await dimensionsOf(target.file).catch(() => ({
      width: 0,
      height: 0,
    }));
    const ok = width === target.size && height === target.size;
    if (!ok) failures.push(`${target.file}: expected ${target.size}², got ${width}×${height}`);
    rows.push(`${ok ? 'ok  ' : 'FAIL'}  ${String(target.size).padStart(4)}²  ${target.file}`);
  }

  const faviconSource = await readFile(join(REPO_ROOT, FAVICON_SVG), 'utf8').catch(() => '');
  const faviconOk = faviconSource.includes('<svg') && faviconSource.includes(ACCENT);
  if (!faviconOk) failures.push(`${FAVICON_SVG}: not a mark-bearing SVG`);
  rows.push(`${faviconOk ? 'ok  ' : 'FAIL'}   vector  ${FAVICON_SVG}`);

  process.stdout.write(`${rows.join('\n')}\n`);
  if (failures.length > 0) {
    process.stderr.write(`\n${failures.join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`\n${TARGETS.length} raster targets + 1 vector verified.\n`);
}

await main();
