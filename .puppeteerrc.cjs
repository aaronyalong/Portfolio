/**
 * Puppeteer is only used by `npm run diagrams` (mermaid-cli), which runs locally.
 * The site build never needs a browser, because the SVGs are committed, so skip the
 * Chromium download in CI and on Cloudflare (which runs `npm ci` with devDependencies).
 *
 * @type {import("puppeteer").Configuration}
 */
const inCI = Boolean(process.env.CI || process.env.CF_PAGES || process.env.WORKERS_CI);

module.exports = {
	skipDownload: inCI,
};
