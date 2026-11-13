import { getCollection, type CollectionEntry } from 'astro:content';

export type Project = CollectionEntry<'projects'>;
export type Job = CollectionEntry<'experience'>;
export type Degree = CollectionEntry<'education'>;
/** Either kind of timeline entry; both collections share one schema. */
export type TimelineItem = Job | Degree;

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
	return jobs.sort((a, b) => byDateDesc(a.data.start, b.data.start) || a.data.org.localeCompare(b.data.org));
}

/** Degrees, most recent end first; degrees with no end date last. */
export async function getEducation(): Promise<Degree[]> {
	const degrees = await getCollection('education');
	return degrees.sort((a, b) => byDateDesc(a.data.end, b.data.end) || a.data.org.localeCompare(b.data.org));
}

/** Descending order for "YYYY" / "YYYY-MM" / "present" values (these compare as strings,
 *  and "present" sorts after any year); missing values last. */
function byDateDesc(a?: string, b?: string): number {
	if (a === b) return 0;
	if (!a) return 1;
	if (!b) return -1;
	return b.localeCompare(a);
}

/** The build month as "YYYY-MM": an end date after it is still in the future. */
const BUILD_MONTH = new Date().toISOString().slice(0, 7);

/** End date is after the build month, e.g. a degree that is not finished yet. */
export const isExpected = (item: TimelineItem) =>
	item.data.end !== undefined && item.data.end !== 'present' && item.data.end > BUILD_MONTH;

/** A role that ends in `present`, or a degree still in progress. */
export const isCurrent = (item: TimelineItem) => item.data.end === 'present' || isExpected(item);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-03" → "Mar 2026", "2024" → "2024", "present" → "Present". */
export function formatYearMonth(value: string): string {
	if (value === 'present') return 'Present';
	const [year, month] = value.split('-');
	return month ? `${MONTHS[Number(month) - 1]} ${year}` : year;
}

/** True for placeholder strings like "TODO: job title". */
export const isTodo = (value: string) => value.startsWith('TODO');
