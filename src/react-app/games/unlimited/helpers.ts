import type { TrackResult } from "../songgame-helpers";

export type { TrackResult };

/* ─── Difficulty ladders ─── */

export type LadderPresetId = "easy" | "classic" | "audiophile" | "custom";

export const LADDER_PRESETS: Record<Exclude<LadderPresetId, "custom">, { label: string; hint: string; steps: number[] }> = {
	easy: { label: "Easy", hint: "1s → 20s", steps: [1, 2, 4, 7, 12, 20] },
	classic: { label: "Classic", hint: "0.5s → 15s", steps: [0.5, 1, 2, 4, 8, 15] },
	audiophile: { label: "Audiophile", hint: "0.25s → 8s", steps: [0.25, 0.5, 1, 2, 4, 8] },
};

export const DEFAULT_CUSTOM_LADDER = [0.5, 1, 2, 4, 8, 15];
export const PREVIEW_LENGTH = 30;
export const FULL_REVEAL_SECONDS = 30;
export const ROUND_SIZE = 5;

/** Percentage awarded for solving at each step; failures score 0. */
export const SCORE_BY_STEP = [100, 85, 70, 55, 40, 25, 15, 10];

export function scoreForStep(step: number | null) {
	if (step === null) return 0;
	return SCORE_BY_STEP[Math.min(step, SCORE_BY_STEP.length - 1)];
}

export function isValidLadder(steps: number[]) {
	if (steps.length < 2 || steps.length > 8) return false;
	return steps.every(
		(value, index) => Number.isFinite(value) && value > 0 && value <= PREVIEW_LENGTH && (index === 0 || value > steps[index - 1]),
	);
}

/* ─── Settings ─── */

export type Settings = {
	ladderPreset: LadderPresetId;
	customLadder: number[];
	randomStart: boolean;
	artHint: boolean;
	compress: boolean;
	volume: number;
	excludedArtists: string[];
	/** Guess search only lists songs from the current round's pool. */
	poolSearch: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
	ladderPreset: "classic",
	customLadder: DEFAULT_CUSTOM_LADDER,
	randomStart: false,
	artHint: false,
	compress: true,
	volume: 0.4,
	excludedArtists: [],
	poolSearch: true,
};

export function ladderForSettings(settings: Settings) {
	if (settings.ladderPreset === "custom") {
		return isValidLadder(settings.customLadder) ? settings.customLadder : DEFAULT_CUSTOM_LADDER;
	}
	return LADDER_PRESETS[settings.ladderPreset].steps;
}

/* ─── Sessions (a run of songs from one source) ─── */

export type SourceKind = "category" | "mix" | "artist" | "playlist" | "quiz";

export type SessionSource = {
	kind: SourceKind;
	/** category id, `artist:<id>`, playlist key, or quiz id */
	id: string;
	title: string;
	emoji: string;
	subtitle?: string;
};

export type Guess = { track: TrackResult | null; correct: boolean; artistMatch: boolean; skipped: boolean };

export type SongState = {
	track: TrackResult;
	/** Seconds into the preview where every snippet starts. */
	offset: number;
	step: number;
	guesses: Guess[];
	status: "playing" | "solved" | "failed";
	solvedStep: number | null;
};

export type Session = {
	source: SessionSource;
	ladder: number[];
	songs: SongState[];
	index: number;
	/** Set once every song is finished. */
	finished: boolean;
	quizId?: string;
	/**
	 * Every song the source could have picked, for focused search. Always
	 * contains the session's own songs. Empty when the pool is unknown or too
	 * small to hide the answer in (quizzes), which falls back to full search.
	 */
	pool: TrackResult[];
};

/* ─── Focused search (over the round's pool) ─── */

export const POOL_SEARCH_MIN = 12;
const POOL_SEARCH_LIMIT = 12;

function searchKey(value: string) {
	return value
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/['\u2019]/g, "")
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

/** Songs (always first) then the rest of the pool, deduped by id. */
export function buildPool(songs: TrackResult[], candidates: TrackResult[]) {
	const pool = new Map<string, TrackResult>();
	for (const track of [...songs, ...candidates]) {
		if (track.id && !pool.has(track.id)) pool.set(track.id, track);
	}
	return [...pool.values()];
}

/**
 * Forgiving local search: every word typed has to start some word of the
 * title or artist (so "bohem que" finds Bohemian Rhapsody by Queen), or the
 * whole phrase has to appear inside one of them. Title hits rank above artist
 * hits; ties keep pool order, which is most popular first.
 */
export function searchPool(pool: TrackResult[], query: string) {
	const phrase = searchKey(query);
	if (!phrase) return [];
	const words = phrase.split(" ");
	const scored: { track: TrackResult; score: number; index: number }[] = [];
	pool.forEach((track, index) => {
		const title = searchKey(displayTitle(track.name));
		const artist = searchKey(track.artists);
		const titleWords = title.split(" ");
		const artistWords = artist.split(" ");
		const combinedWords = [...titleWords, ...artistWords];
		let score = 0;
		if (title.startsWith(phrase)) score = 6;
		else if (artist.startsWith(phrase)) score = 5;
		else if (title.includes(phrase)) score = 4;
		else if (artist.includes(phrase)) score = 3;
		else if (words.every((word) => titleWords.some((entry) => entry.startsWith(word)))) score = 2;
		else if (words.every((word) => combinedWords.some((entry) => entry.startsWith(word)))) score = 1;
		if (score > 0) scored.push({ track, score, index });
	});
	return scored
		.sort((a, b) => b.score - a.score || a.index - b.index)
		.slice(0, POOL_SEARCH_LIMIT)
		.map((entry) => entry.track);
}

export function createSongState(track: TrackResult, ladder: number[], randomStart: boolean): SongState {
	const maxStep = ladder[ladder.length - 1];
	const latestStart = Math.max(0, PREVIEW_LENGTH - maxStep - 1);
	const offset = randomStart ? Math.round(Math.random() * latestStart * 10) / 10 : 0;
	return { track, offset, step: 0, guesses: [], status: "playing", solvedStep: null };
}

export function sessionScore(session: Session) {
	const songs = session.songs;
	if (songs.length === 0) return 0;
	const total = songs.reduce((sum, song) => sum + (song.status === "solved" ? scoreForStep(song.solvedStep) : 0), 0);
	return Math.round(total / songs.length);
}

/* ─── Matching (a bit more forgiving than the daily game) ─── */

function normalizeTitle(value: string) {
	return value
		.toLowerCase()
		.replace(/\s*[([].*?[)\]]/g, "")
		.replace(/\s*-\s*.*$/, "")
		.replace(/feat\..*|ft\..*/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function normalizeArtist(value: string) {
	return value
		.toLowerCase()
		.replace(/\s*[([].*?[)\]]/g, "")
		.replace(/^the\s+/, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

export function splitArtists(value: string) {
	return value
		.replace(/\s*[([].*?[)\]]/g, "")
		.split(/,|&|\bfeat\.?\b|\bft\.?\b|\bwith\b|\band\b|\bx\b|\/|;/i)
		.map((entry) => normalizeArtist(entry))
		.filter(Boolean);
}

export function artistsOverlap(a: string, b: string) {
	const listA = splitArtists(a);
	const listB = splitArtists(b);
	return listA.some((artist) => listB.some((other) => other === artist || other.includes(artist) || artist.includes(other)));
}

export function isCorrectGuess(guess: TrackResult, answer: TrackResult) {
	if (guess.id && answer.id && guess.id === answer.id) return true;
	return normalizeTitle(guess.name) === normalizeTitle(answer.name) && artistsOverlap(guess.artists, answer.artists);
}

/* ─── Formatting ─── */

/** Drops "(2009 Remaster)" style suffixes for display; matching uses the raw title. */
export function displayTitle(name: string) {
	const cleaned = name
		.replace(/\s*[([][^)\]]*(remaster|mono|stereo|single version|album version|radio edit|explicit)[^)\]]*[)\]]/gi, "")
		.replace(/\s*-\s*(\d{4}\s*)?remaster(ed)?(\s*\d{4})?\s*$/i, "")
		.trim();
	return cleaned || name;
}

export function formatSeconds(value: number) {
	if (Number.isInteger(value)) return `${value}`;
	return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function formatPercent(value: number | null) {
	return value === null ? "–" : `${Math.round(value)}%`;
}

export function shuffle<T>(items: T[]) {
	const copy = [...items];
	for (let index = copy.length - 1; index > 0; index--) {
		const swap = Math.floor(Math.random() * (index + 1));
		[copy[index], copy[swap]] = [copy[swap], copy[index]];
	}
	return copy;
}

export function scoreEmoji(step: number | null, solved: boolean) {
	if (!solved) return "⬛";
	if (step === 0) return "🟩";
	if (step !== null && step <= 2) return "🟨";
	return "🟧";
}
