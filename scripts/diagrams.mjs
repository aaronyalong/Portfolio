#!/usr/bin/env node
/**
 * Renders every public/diagrams/**\/*.mmd to <name>.light.svg and <name>.dark.svg
 * next to the source. Run with `npm run diagrams` after editing a diagram, and commit
 * the SVGs: the site build never renders diagrams, so it never needs a browser.
 *
 * Embed in Markdown with a <picture>, so the page follows the reader's colour scheme:
 *
 *   <picture>
 *     <source srcset="/diagrams/x.dark.svg" media="(prefers-color-scheme: dark)" />
 *     <img src="/diagrams/x.light.svg" alt="..." />
 *   </picture>
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const diagramsDir = join(root, 'public', 'diagrams');
const mermaidConfig = join(root, 'scripts', 'mermaid.config.json');
const bin = (name) => join(root, 'node_modules', '.bin', name);

/** Light and dark variants: Mermaid theme per output suffix. */
const VARIANTS = [
	{ suffix: 'light', theme: 'default' },
	{ suffix: 'dark', theme: 'dark' },
];

const sources = (existsSync(diagramsDir) ? readdirSync(diagramsDir, { recursive: true }) : [])
	.filter((file) => file.endsWith('.mmd'))
	.map((file) => join(diagramsDir, file))
	.sort();

if (sources.length === 0) {
	console.log(`No .mmd files in ${relative(root, diagramsDir)}/`);
	process.exit(0);
}

// The only place Chromium is downloaded: npm install doesn't run Puppeteer's postinstall
// (and .puppeteerrc.cjs skips it in CI). No-op when the browser is already cached.
execFileSync(bin('puppeteer'), ['browsers', 'install', 'chrome-headless-shell'], {
	stdio: ['ignore', 'ignore', 'inherit'],
});

for (const source of sources) {
	for (const { suffix, theme } of VARIANTS) {
		const output = source.replace(/\.mmd$/, `.${suffix}.svg`);
		execFileSync(
			bin('mmdc'),
			['-i', source, '-o', output, '-t', theme, '-b', 'transparent', '-c', mermaidConfig, '-q'],
			{ stdio: 'inherit' },
		);
		console.log(`✓ ${relative(root, output)}`);
	}
}
