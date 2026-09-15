import { DEFAULT_SETTINGS, type Settings, type TrackResult } from "./helpers";

const SETTINGS_KEY = "unlimited-settings";
const STATS_KEY = "unlimited-stats";
const PLAYLISTS_KEY = "unlimited-playlists";
const SEEN_KEY = "unlimited-seen";

const SEEN_CAP = 250;
const PLAYLIST_CAP = 12;

function read<T>(key: string): T | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
}

function write(key: string, value: unknown) {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// Storage full or blocked; the game still works for this session.
	}
}

/* ─── Settings ─── */

export function loadSettings(): Settings {
	const stored = read<Partial<Settings>>(SETTINGS_KEY);
	return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

export function saveSettings(settings: Settings) {
	write(SETTINGS_KEY, settings);
}

/* ─── Lifetime stats ─── */

export type Stats = {
	played: number;
	solved: number;
	scoreSum: number;
	streak: number;
	bestStreak: number;
	fastest: number | null;
};

export const EMPTY_STATS: Stats = { played: 0, solved: 0, scoreSum: 0, streak: 0, bestStreak: 0, fastest: null };

export function loadStats(): Stats {
	return { ...EMPTY_STATS, ...(read<Partial<Stats>>(STATS_KEY) ?? {}) };
}

export function recordSong(solved: boolean, score: number, solvedSeconds: number | null) {
	const stats = loadStats();
	stats.played += 1;
	stats.scoreSum += score;
	if (solved) {
		stats.solved += 1;
		stats.streak += 1;
		stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
		if (solvedSeconds !== null && (stats.fastest === null || solvedSeconds < stats.fastest)) {
			stats.fastest = solvedSeconds;
		}
	} else {
		stats.streak = 0;
	}
	write(STATS_KEY, stats);
	return stats;
}

/* ─── Imported playlists ─── */

export type SavedTrack = {
	name: string;
	artists: string;
	album: string;
	artwork: string | null;
	previewUrl: string | null;
	/** Deezer match once resolved; `null` means we tried and found nothing. */
	resolved?: TrackResult | null;
};

export type SavedPlaylist = {
	key: string;
	provider: "spotify" | "apple" | "deezer";
	name: string;
	artwork: string | null;
	sourceUrl: string;
	tracks: SavedTrack[];
	addedAt: number;
};

export function loadPlaylists(): SavedPlaylist[] {
	return read<SavedPlaylist[]>(PLAYLISTS_KEY) ?? [];
}

export function savePlaylist(playlist: SavedPlaylist) {
	const others = loadPlaylists().filter((entry) => entry.key !== playlist.key);
	const next = [playlist, ...others].slice(0, PLAYLIST_CAP);
	write(PLAYLISTS_KEY, next);
	return next;
}

export function removePlaylist(key: string) {
	const next = loadPlaylists().filter((entry) => entry.key !== key);
	write(PLAYLISTS_KEY, next);
	return next;
}

export function updatePlaylistTracks(key: string, tracks: SavedTrack[]) {
	const next = loadPlaylists().map((entry) => (entry.key === key ? { ...entry, tracks } : entry));
	write(PLAYLISTS_KEY, next);
	return next;
}

/* ─── Recently played (so rounds don't repeat) ─── */

export function loadSeen(sourceId: string): string[] {
	const map = read<Record<string, string[]>>(SEEN_KEY) ?? {};
	return map[sourceId] ?? [];
}

export function markSeen(sourceId: string, ids: string[]) {
	const map = read<Record<string, string[]>>(SEEN_KEY) ?? {};
	const merged = [...(map[sourceId] ?? []), ...ids].slice(-SEEN_CAP);
	map[sourceId] = merged;
	// Keep the map itself from growing without bound.
	const keys = Object.keys(map);
	if (keys.length > 40) {
		for (const key of keys.slice(0, keys.length - 40)) delete map[key];
	}
	write(SEEN_KEY, map);
}
