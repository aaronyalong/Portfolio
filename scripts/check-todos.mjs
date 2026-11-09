#!/usr/bin/env node
/**
 * Fails if any built page shows a visible "TODO" placeholder, so unfinished content can't
 * be deployed. Run after `astro build` (`npm run build:deploy` does both).
 *
 * Scans the rendered HTML in dist/ rather than the sources, so it sees exactly what a
 * visitor would: code comments and HTML comments never trigger it.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

if (!existsSync(dist)) {
	console.error('No dist/ folder. Run `npm run build` first, or use `npm run build:deploy`.');
	process.exit(2);
}

/** Visible text of a page: no comments, scripts, styles or tags. */
function visibleText(html) {
	return html
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
		.replace(/<[^>]+>/g, '\n')
		.replace(/&[a-z#0-9]+;/gi, ' ');
}

const pages = readdirSync(dist, { recursive: true })
	.filter((file) => file.endsWith('.html'))
	.sort();

const found = [];
for (const page of pages) {
	const lines = visibleText(readFileSync(join(dist, page), 'utf8')).split('\n');
	for (const line of lines) {
		if (/\bTODO\b/.test(line)) found.push({ page, text: line.trim().replace(/\s+/g, ' ') });
	}
}

if (found.length === 0) {
	console.log(`✓ No visible TODOs in ${pages.length} page${pages.length === 1 ? '' : 's'}.`);
	process.exit(0);
}

console.error(`✗ ${found.length} visible TODO(s) in ${relative(root, dist)}/:`);
for (const { page, text } of found) console.error(`  ${page}: ${text}`);
process.exit(1);
