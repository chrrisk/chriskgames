export type TrackResult = {
	id: string;
	name: string;
	artists: string;
	album: string;
	artwork?: string | null;
	previewUrl?: string | null;
	duration?: number | null;
	provider?: string;
	url?: string | null;
};

export const ALL_CATEGORY_KEYS = ["oldies", "modern", "holiday"] as const;
export type CategoryKey = (typeof ALL_CATEGORY_KEYS)[number];
export const DEFAULT_CATEGORY_ORDER: CategoryKey[] = ["oldies", "modern"];
export const HOLIDAY_CATEGORY: CategoryKey = "holiday";

export const CATEGORY_LABELS: Record<CategoryKey, { title: string; description: string; emoji: string }> = {
	oldies: { title: "Oldies but Goodies", description: "Classic throwbacks", emoji: "📼" },
	modern: { title: "2000s & Newer", description: "Fresh favorites", emoji: "🎧" },
	holiday: { title: "Holiday Classics", description: "Seasonal favorites", emoji: "🎄" },
};

export function mergeCategoryMap<T>(
	incoming: Partial<Record<CategoryKey, T>> | undefined,
	fallback: Record<CategoryKey, T>,
) {
	return ALL_CATEGORY_KEYS.reduce((acc, key) => {
		acc[key] = (incoming?.[key] ?? fallback[key]) as T;
		return acc;
	}, {} as Record<CategoryKey, T>);
}

export function getActiveCategoryKeysForDate(currentDateKey: string): CategoryKey[] {
	return isHolidaySeason(currentDateKey) ? [...DEFAULT_CATEGORY_ORDER, HOLIDAY_CATEGORY] : DEFAULT_CATEGORY_ORDER;
}

function isHolidaySeason(currentDateKey: string) {
	const [, monthStr, dayStr] = currentDateKey.split("-");
	const month = Number(monthStr);
	const day = Number(dayStr);
	if (Number.isNaN(month) || Number.isNaN(day)) {
		return false;
	}
	return month === 12 || (month === 1 && day === 1);
}

/* ─── Track matching ─── */

function normalizeTrackText(value: string) {
	return value
		.toLowerCase()
		.replace(/\([^)]*\)/g, "")
		.replace(/feat\..*/gi, "")
		.replace(/-/g, " ")
		.trim();
}

export function isMatchingTrack(a: TrackResult, b: TrackResult) {
	return (
		normalizeTrackText(a.name) === normalizeTrackText(b.name) &&
		artistsMatchExactly(a.artists, b.artists)
	);
}

export function hasMatchingArtist(a: TrackResult, b: TrackResult) {
	return artistsOverlap(a.artists, b.artists);
}

function normalizeArtistList(value: string) {
	const cleaned = value
		.toLowerCase()
		.replace(/\([^)]*\)/g, "")
		.replace(/feat\..*/gi, "")
		.replace(/with .*/gi, "")
		.replace(/[-+]/g, " ")
		.replace(/\band\b/g, ",")
		.replace(/&/g, ",");
	return cleaned
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function artistsMatchExactly(a: string, b: string) {
	const listA = normalizeArtistList(a);
	const listB = normalizeArtistList(b);
	if (listA.length !== listB.length) return false;
	const setB = new Set(listB);
	return listA.every((artist) => setB.has(artist));
}

function artistsOverlap(a: string, b: string) {
	const setA = new Set(normalizeArtistList(a));
	return normalizeArtistList(b).some((artist) => setA.has(artist));
}

/* ─── Formatting ─── */

export function formatSecondsLabel(value: number) {
	return Number.isInteger(value) ? value.toString() : value.toFixed(1).replace(/\.0$/, "");
}

export function formatArchiveDateLabel(dateKey: string) {
	const date = new Date(`${dateKey}T12:00:00Z`);
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
	}).format(date);
}

export function formatArchiveLongDate(dateKey: string) {
	const date = new Date(`${dateKey}T12:00:00Z`);
	return new Intl.DateTimeFormat("en-US", {
		weekday: "short",
		month: "long",
		day: "numeric",
		year: "numeric",
	}).format(date);
}

export function groupDatesByMonth(dateKeys: string[]) {
	const groups = new Map<string, string[]>();
	for (const dateKey of dateKeys) {
		const monthKey = dateKey.slice(0, 7);
		const current = groups.get(monthKey) ?? [];
		current.push(dateKey);
		groups.set(monthKey, current);
	}
	return [...groups.entries()].map(([monthKey, dates]) => ({
		key: monthKey,
		label: formatArchiveMonthLabel(monthKey),
		dates,
	}));
}

function formatArchiveMonthLabel(monthKey: string) {
	const date = new Date(`${monthKey}-01T12:00:00Z`);
	return new Intl.DateTimeFormat("en-US", {
		month: "long",
		year: "numeric",
	}).format(date);
}
