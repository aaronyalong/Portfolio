// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	// The site is one page now; the old section pages forward to its anchors. A static build
	// writes these as tiny HTML pages with a meta refresh and a canonical link (no JS).
	redirects: {
		'/experience': '/#experience',
		'/projects': '/#projects',
	},
	markdown: {
		shikiConfig: {
			// Light by default; global.css switches to the dark tokens in dark mode.
			themes: { light: 'github-light', dark: 'github-dark' },
		},
	},
});
