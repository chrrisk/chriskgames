import type { TrackResult } from "./helpers";
import type { SavedTrack } from "./storage";

async function readJson<T>(response: Response): Promise<T> {
	const data = (await response.json().catch(() => ({}))) as T & { error?: string };
	if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
	return data;
}

export async function fetchRound(
	categoryId: string,
	count: number,
	excludedArtists: string[],
	seen: string[],
	signal?: AbortSignal,
) {
	const params = new URLSearchParams({ category: categoryId, count: String(count) });
	if (excludedArtists.length) params.set("exclude", excludedArtists.join(","));
	if (seen.length) params.set("seen", seen.slice(-150).join(","));
	const data = await readJson<{ tracks: TrackResult[] }>(
		await fetch(`/api/unlimited/round?${params}`, { signal }),
	);
	return data.tracks;
}

export async function searchTracks(query: string, signal?: AbortSignal) {
	const data = await readJson<{ tracks: TrackResult[] }>(
		await fetch(`/api/music/search?q=${encodeURIComponent(query)}`, { signal }),
	);
	return data.tracks ?? [];
}

/** Re-fetches Deezer tracks so their short-lived preview URLs are valid. */
export async function fetchFreshTracks(ids: string[]) {
	if (ids.length === 0) return [] as (TrackResult | null)[];
	const data = await readJson<{ tracks: (TrackResult | null)[] }>(
		await fetch(`/api/unlimited/tracks?ids=${encodeURIComponent(ids.join(","))}`),
	);
	return data.tracks;
}

/**
 * Swaps stale Deezer previews for fresh ones; tracks from other providers and
 * tracks Deezer no longer serves are returned untouched.
 */
export async function refreshDeezerTracks(tracks: TrackResult[]) {
	const ids = tracks.filter((track) => track.provider === "deezer" && /^\d+$/.test(track.id)).map((track) => track.id);
	if (ids.length === 0) return tracks;
	try {
		const fresh = await fetchFreshTracks(ids);
		const byId = new Map<string, TrackResult>();
		fresh.forEach((track, index) => {
			if (track?.previewUrl) byId.set(ids[index], track);
		});
		return tracks.map((track) => byId.get(track.id) ?? track);
	} catch {
		return tracks;
	}
}

export type ArtistResult = { id: string; name: string; picture: string | null; fans: number };

export async function searchArtists(query: string, signal?: AbortSignal) {
	const data = await readJson<{ artists: ArtistResult[] }>(
		await fetch(`/api/unlimited/artists?q=${encodeURIComponent(query)}`, { signal }),
	);
	return data.artists ?? [];
}

export type ImportedPlaylist = {
	key: string;
	provider: "spotify" | "apple" | "deezer";
	name: string;
	artwork: string | null;
	sourceUrl: string;
	tracks: SavedTrack[];
};

export async function importPlaylist(url: string) {
	const data = await readJson<{ playlist: ImportedPlaylist }>(
		await fetch("/api/unlimited/import", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ url }),
		}),
	);
	return data.playlist;
}

export async function resolveTracks(tracks: { name: string; artists: string }[]) {
	const data = await readJson<{ tracks: (TrackResult | null)[] }>(
		await fetch("/api/unlimited/resolve", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ tracks }),
		}),
	);
	return data.tracks;
}

export type QuizPayload = {
	id: string;
	title: string;
	from: string;
	ladder: number[] | null;
	randomStart: boolean;
	tracks: TrackResult[];
};

export type QuizStats = { count: number; average: number | null; leaderboard: { name: string; score: number }[] };

export async function createQuiz(input: {
	title: string;
	from: string;
	trackIds: string[];
	ladder: number[] | null;
	randomStart: boolean;
}) {
	const data = await readJson<{ id: string }>(
		await fetch("/api/unlimited/quiz", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(input),
		}),
	);
	return data.id;
}

export async function fetchQuiz(id: string) {
	return readJson<{ quiz: QuizPayload; stats: QuizStats }>(
		await fetch(`/api/unlimited/quiz/${encodeURIComponent(id)}`),
	);
}

export async function submitQuizResult(id: string, score: number, name: string) {
	return readJson<QuizStats>(
		await fetch(`/api/unlimited/quiz/${encodeURIComponent(id)}/result`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ score, name }),
		}),
	);
}
