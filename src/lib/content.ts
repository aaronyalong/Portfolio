import { getCollection, type CollectionEntry } from 'astro:content';

export type Project = CollectionEntry<'projects'>;
export type Job = CollectionEntry<'experience'>;

/** Non-draft projects, by `order` (unordered last), then title. */
export async function getProjects(): Promise<Project[]> {
	const projects = await getCollection('projects', ({ data }) => !data.draft);
	return projects.sort((a, b) => {
		const ao = a.data.order ?? Number.POSITIVE_INFINITY;
		const bo = b.data.order ?? Number.POSITIVE_INFINITY;
		if (ao !== bo) return ao - bo;
		return a.data.title.localeCompare(b.data.title);
	});
}

/** Roles, most recent start first; roles with no start date last. */
export async function getExperience(): Promise<Job[]> {
	const jobs = await getCollection('experience');
	return jobs.sort((a, b) => {
		const as = a.data.start;
		const bs = b.data.start;
		if (as === bs) return a.data.company.localeCompare(b.data.company);
		if (!as) return 1;
		if (!bs) return -1;
		// "YYYY" / "YYYY-MM" compare correctly as strings.
		return bs.localeCompare(as);
	});
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-03" → "Mar 2026", "2024" → "2024", "present" → "Present". */
export function formatYearMonth(value: string): string {
	if (value === 'present') return 'Present';
	const [year, month] = value.split('-');
	return month ? `${MONTHS[Number(month) - 1]} ${year}` : year;
}

/** Formatted start/end; `null` marks a part that is unknown and needs a TODO. */
export function formatRange(start?: string, end?: string): { start: string | null; end: string | null } {
	return {
		start: start ? formatYearMonth(start) : null,
		end: end ? formatYearMonth(end) : null,
	};
}

/** True for placeholder strings like "TODO: job title". */
export const isTodo = (value: string) => value.startsWith('TODO');
