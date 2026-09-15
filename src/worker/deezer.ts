/** Deezer public API helpers shared by the daily and unlimited song games. */

export type DeezerTrack = {
	id?: number;
	title?: string | null;
	title_short?: string | null;
	artist?: { name?: string | null } | null;
	album?: { title?: string | null; cover_medium?: string | null; cover?: string | null } | null;
	preview?: string | null;
	duration?: number | null;
	link?: string | null;
};

export type DeezerListResponse = {
	data?: DeezerTrack[];
	total?: number;
	next?: string;
	error?: { message?: string };
};

export type MappedTrack = {
	id: string;
	name: string;
	artists: string;
	album: string;
	artwork: string | null;
	previewUrl: string | null;
	duration: number | null;
	provider: "deezer";
	url: string | null;
};

export function mapDeezerTrack(item: DeezerTrack): MappedTrack {
	return {
		id: String(item.id ?? ""),
		name: item.title ?? item.title_short ?? "",
		artists: item.artist?.name ?? "",
		album: item.album?.title ?? "",
		artwork: item.album?.cover_medium ?? item.album?.cover ?? null,
		previewUrl: item.preview ?? null,
		duration: item.duration ?? null,
		provider: "deezer",
		url: item.link ?? null,
	};
}

export async function fetchDeezerTrack(trackId: string) {
	const response = await fetch(`https://api.deezer.com/track/${encodeURIComponent(trackId)}`);
	if (!response.ok) {
		throw new Error(`Failed to fetch track ${trackId} (${response.status})`);
	}
	const data = (await response.json()) as DeezerTrack & { error?: unknown };
	if (data.error || !data.id) {
		throw new Error(`Track ${trackId} not found`);
	}
	return mapDeezerTrack(data);
}

export async function searchDeezerTracks(query: string, limit = 20) {
	const response = await fetch(
		`https://api.deezer.com/search/track?${new URLSearchParams({ q: query, limit: String(limit) })}`,
	);
	if (!response.ok) {
		throw new Error(`Deezer search failed (${response.status})`);
	}
	const data = (await response.json()) as DeezerListResponse;
	return (data.data ?? []).map(mapDeezerTrack);
}

/**
 * The daily game's search filter: drops remixes, live cuts, edits and so on so
 * the guess list stays focused on original recordings.
 */
export function isAlternateVersion(title: string) {
	const lower = title.toLowerCase();
	const keywordPatterns = [
		"(live",
		"live version",
		"acoustic",
		"karaoke",
		"instrumental",
		"edit",
		"remix",
		"mix)",
		"mix ",
		"cover",
		"demo",
		"version",
		"wedding",
		"extended",
	];

	if (/\(([^)]*remix|live|acoustic|version|edit|karaoke|instrumental|demo|cover|extended)[^)]*\)/i.test(title)) {
		return true;
	}

	return keywordPatterns.some((keyword) => lower.includes(keyword));
}

/**
 * Lighter filter for answer pools: only throws out recordings that would be
 * unfair to guess from (karaoke, instrumentals, live takes, tribute covers).
 */
export function isUnfairAnswer(title: string) {
	return /karaoke|instrumental|\blive\b|tribute|made famous|originally performed|in the style of|sped up|slowed/i.test(
		title,
	);
}
