/**
 * A tiny, safe subset of inline Markdown for short strings such as timeline bullets:
 * `**bold**` and `[text](url)`, nothing else. Everything is HTML-escaped first, and links
 * only accept https://, site-relative "/…", "#…" and mailto: targets, so the result is safe
 * to render with set:html. No imports, so it can be tested on its own.
 *
 *   inlineMarkdown('**Retrieval:** hybrid search, see [Oracle](/projects/oracle/)')
 *   → '<strong>Retrieval:</strong> hybrid search, see <a href="/projects/oracle/">Oracle</a>'
 */

const escapeHtml = (text: string) =>
	text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

/** Escape, then turn **bold** into <strong>. */
const bold = (text: string) => escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const SAFE_HREF = /^(?:https:\/\/|\/(?!\/)|#|mailto:)/i;

export function inlineMarkdown(text: string): string {
	let html = '';
	let last = 0;
	// Links are found first, so a URL is never touched by the **bold** pass.
	for (const match of text.matchAll(LINK)) {
		const [whole, label, href] = match;
		const start = match.index ?? 0;
		html += bold(text.slice(last, start));
		html += SAFE_HREF.test(href) ? `<a href="${escapeHtml(href)}">${bold(label)}</a>` : bold(whole);
		last = start + whole.length;
	}
	return html + bold(text.slice(last));
}
