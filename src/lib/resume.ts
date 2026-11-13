import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONTACT } from './site';

/**
 * The resume link, or `null` when the PDF is missing from public/, so every resume link
 * hides instead of pointing at a 404. Checked at build time (the build runs from the
 * project root). Build-time only: import from component frontmatter, never client code.
 */
export const RESUME_HREF: string | null = existsSync(join(process.cwd(), 'public', CONTACT.resume))
	? CONTACT.resume
	: null;
