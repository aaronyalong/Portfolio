// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	markdown: {
		shikiConfig: {
			// Light by default; global.css switches to the dark tokens in dark mode.
			themes: { light: 'github-light', dark: 'github-dark' },
		},
	},
});
