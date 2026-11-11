import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/** "2024" or "2024-03". */
const yearMonth = z
	.string()
	.regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/, 'Use YYYY or YYYY-MM');

const projects = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
	schema: z.object({
		title: z.string(),
		/** One line, shown on cards and the projects index. */
		summary: z.string(),
		stack: z.array(z.string()).default([]),
		repo: z.url().optional(),
		/** Where to play or try it, e.g. a hosted build of a game. */
		play: z.url().optional(),
		/** False for a short entry: a card on the projects index, but no case-study page. */
		caseStudy: z.boolean().default(true),
		/** e.g. "CMPE 259 project". */
		context: z.string().optional(),
		/** Aaron's role, for team projects. */
		role: z.string().optional(),
		teamSize: z.number().int().positive().optional(),
		/** Omit when unknown rather than guessing. */
		status: z.enum(['in-progress', 'complete']).optional(),
		/** Shown on the home page (pick 3). */
		featured: z.boolean().default(false),
		/** Lower sorts first; unordered entries sort last, by title. */
		order: z.number().int().optional(),
		draft: z.boolean().default(false),
	}),
});

const experience = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/experience' }),
	schema: z.object({
		company: z.string(),
		role: z.string(),
		/** Omit when unknown; the page shows a TODO instead. */
		start: yearMonth.optional(),
		end: z.union([yearMonth, z.literal('present')]).optional(),
		/** Shown after the dates. Delete when the role becomes full-time. */
		partTime: z.boolean().default(false),
		stack: z.array(z.string()).default([]),
	}),
});

export const collections = { projects, experience };
