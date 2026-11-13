import { defineCollection, reference } from 'astro:content';
import { file, glob } from 'astro/loaders';
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
		/** Home showcase: one headline result, taken from the case study (never invented). */
		highlight: z.object({ value: z.string(), label: z.string() }).optional(),
		/** Home showcase image: a path under public/, an optional dark-mode variant, alt text. */
		thumbnail: z
			.object({
				src: z.string().startsWith('/'),
				dark: z.string().startsWith('/').optional(),
				alt: z.string(),
				width: z.number().int().positive(),
				height: z.number().int().positive(),
			})
			.optional(),
		/** Lower sorts first; unordered entries sort last, by title. */
		order: z.number().int().optional(),
		draft: z.boolean().default(false),
	}),
});

/**
 * One timeline entry: a role (experience) or a degree (education). Quote dates in YAML
 * ("2024"), or a bare year parses as a number and fails validation.
 */
const timelineEntry = z.object({
	/** Job title or degree. */
	title: z.string(),
	/** Company or school. */
	org: z.string(),
	/** Omit when unknown; experience then shows a TODO, education shows the end date only. */
	start: yearMonth.optional(),
	/** "present" marks a current role. A degree whose end is after the build date is "Expected". */
	end: z.union([yearMonth, z.literal('present')]).optional(),
	/** Shown next to the dates; omit for full-time. */
	type: z.enum(['full-time', 'part-time', 'contract', 'internship']).optional(),
	/** One line. Can be combined with bullets. */
	summary: z.string().optional(),
	bullets: z.array(z.string()).max(4).default([]),
	stack: z.array(z.string()).default([]),
	/** External links, e.g. a repo. */
	links: z.array(z.object({ label: z.string(), href: z.url() })).default([]),
	/** Related projects; only those with a case study are rendered as links. */
	projects: z.array(reference('projects')).default([]),
	coursework: z.array(z.string()).default([]),
});

const experience = defineCollection({
	loader: file('./src/content/experience.yaml'),
	schema: timelineEntry,
});

const education = defineCollection({
	loader: file('./src/content/education.yaml'),
	schema: timelineEntry,
});

export const collections = { projects, experience, education };
