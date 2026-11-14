#!/usr/bin/env node
/**
 * Fails if any built page links to something that isn't in the build: a missing page or
 * file, or a `#fragment` with no matching id on its target page (e.g. a nav link to
 * "/#interests" after the section was renamed). Run after `astro build`
 * (`npm run build:deploy` does both).
 *
 * Checks every internal URL in dist/ HTML: href, src, srcset entries, and the redirect
 * pages' meta-refresh targets. External links (other origins, mailto:, tel:) are skipped.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

if (!existsSync(dist)) {
	console.error('No dist/ folder. Run `npm run build` first, or use `npm run build:deploy`.');
	process.exit(2);
}

const ORIGIN = 'http://site.invalid';

const pages = readdirSync(dist, { recursive: true })
	.filter((file) => file.endsWith('.html'))
	.sort();

/** The dist file a site path is served from, or null. */
function fileFor(pathname) {
	const base = join(dist, decodeURIComponent(pathname));
	const candidates = pathname.endsWith('/')
		? [join(base, 'index.html')]
		: [base, join(base, 'index.html'), `${base}.html`];
	return candidates.find((file) => existsSync(file) && statSync(file).isFile()) ?? null;
}

/** Ids on a page (cached), for checking #fragments. */
const idCache = new Map();
function idsIn(file) {
	if (!idCache.has(file)) {
		const html = readFileSync(file, 'utf8');
		idCache.set(file, new Set([...html.matchAll(/\s(?:id|name)="([^"]+)"/g)].map((m) => m[1])));
	}
	return idCache.get(file);
}

/** Every URL a page references, as written. */
function urlsIn(html) {
	const urls = [];
	for (const [, , value] of html.matchAll(/\s(href|src)="([^"]*)"/g)) urls.push(value);
	for (const [, value] of html.matchAll(/\ssrcset="([^"]*)"/g)) {
		for (const candidate of value.split(',')) urls.push(candidate.trim().split(/\s+/)[0]);
	}
	for (const [, value] of html.matchAll(/http-equiv="refresh"\s+content="\d+;\s*url=([^"]+)"/g)) {
		urls.push(value);
	}
	return urls.filter(Boolean).map((url) => url.replaceAll('&amp;', '&'));
}

const broken = [];
let checked = 0;

for (const page of pages) {
	const pagePath = `/${page.replaceAll('\\', '/')}`.replace(/index\.html$/, '');
	const pageFile = join(dist, page);
	for (const raw of urlsIn(readFileSync(pageFile, 'utf8'))) {
		let url;
		try {
			url = new URL(raw, ORIGIN + pagePath);
		} catch {
			broken.push({ page, raw, why: 'not a valid URL' });
			continue;
		}
		if (url.origin !== ORIGIN) continue; // external, mailto:, tel:, data:
		checked++;

		const target = fileFor(url.pathname);
		if (!target) {
			broken.push({ page, raw, why: 'no such page or file' });
			continue;
		}
		const fragment = decodeURIComponent(url.hash.slice(1));
		if (fragment && target.endsWith('.html') && !idsIn(target).has(fragment)) {
			broken.push({ page, raw, why: `no id="${fragment}" on ${relative(dist, target)}` });
		}
	}
}

if (broken.length === 0) {
	console.log(`✓ ${checked} internal links in ${pages.length} pages all resolve.`);
	process.exit(0);
}

console.error(`✗ ${broken.length} broken internal link(s) in ${relative(root, dist)}/:`);
for (const { page, raw, why } of broken) console.error(`  ${page}: ${raw} (${why})`);
process.exit(1);
