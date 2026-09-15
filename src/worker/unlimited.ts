import { Hono } from "hono";
import {
	MIX_CATEGORY_ID,
	UNLIMITED_CATEGORIES,
	findCategory,
	type UnlimitedSource,
} from "../shared/unlimited-catalog";
import {
	fetchDeezerTrack,
	isUnfairAnswer,
	mapDeezerTrack,
	searchDeezerTracks,
	type DeezerListResponse,
	type MappedTrack,
} from "./deezer";

type Bindings = {
	ASSETS: Fetcher;
	DB: D1Database;
};

/** A track pulled from a Spotify / Apple Music / Deezer playlist link. */
export type ImportedTrack = {
	name: string;
	artists: string;
	album: string;
	artwork: string | null;
	/** Present when the source service hands out its own 30s preview. */
	previewUrl: string | null;
};

export type ImportedPlaylist = {
	key: string;
	provider: "spotify" | "apple" | "deezer";
	name: string;
	artwork: string | null;
	sourceUrl: string;
	tracks: ImportedTrack[];
};

type QuizPayload = {
	title: string;
	from: string;
	trackIds: string[];
	ladder: number[] | null;
	randomStart: boolean;
};

const ROUND_SIZE_MAX = 10;
const IMPORT_TRACK_CAP = 500;
const QUIZ_TRACK_CAP = 10;
const PLAYLIST_CACHE_SECONDS = 6 * 60 * 60;
const CHART_CACHE_SECONDS = 60 * 60;
const BROWSER_UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

export const unlimited = new Hono<{ Bindings: Bindings }>();

/* ─── Rounds ─── */

unlimited.get("/round", async (c) => {
	const categoryId = c.req.query("category") ?? "";
	const count = clampInt(c.req.query("count"), 1, ROUND_SIZE_MAX, 5);
	const excludedArtists = new Set(splitList(c.req.query("exclude")).map(normalizeArtist));
	const seen = new Set(splitList(c.req.query("seen")));

	try {
		const pool = await buildPool(categoryId, count);
		const picks = pickRound(pool, count, excludedArtists, seen);
		if (picks.length === 0) {
			return jsonError("No playable songs found for that category right now", 502);
		}
		return c.json({ tracks: picks });
	} catch (error) {
		console.error("Unlimited round error", error);
		return jsonError(error instanceof Error ? error.message : "Unable to build a round", 502);
	}
});

unlimited.get("/artists", async (c) => {
	const query = (c.req.query("q") ?? "").trim();
	if (!query) return jsonError("Missing query parameter", 400);
	try {
		const response = await fetch(
			`https://api.deezer.com/search/artist?${new URLSearchParams({ q: query, limit: "8" })}`,
		);
		if (!response.ok) return jsonError("Artist search failed", 502);
		const data = (await response.json()) as {
			data?: { id?: number; name?: string; picture_medium?: string; nb_fan?: number }[];
		};
		const artists = (data.data ?? [])
			.filter((artist) => artist.id && artist.name)
			.map((artist) => ({
				id: String(artist.id),
				name: artist.name ?? "",
				picture: artist.picture_medium ?? null,
				fans: artist.nb_fan ?? 0,
			}));
		return c.json({ artists });
	} catch (error) {
		console.error("Artist search error", error);
		return jsonError("Unable to reach Deezer", 502);
	}
});

/* ─── Playlist import ─── */

unlimited.post("/import", async (c) => {
	let body: { url?: unknown };
	try {
		body = await c.req.json();
	} catch {
		return jsonError("Invalid JSON body", 400);
	}
	const raw = typeof body.url === "string" ? body.url.trim() : "";
	if (!raw) return jsonError("Paste a playlist link first", 400);

	try {
		const playlist = await importPlaylist(raw);
		if (!playlist) {
			return jsonError(
				"That link isn't a Spotify, Apple Music or Deezer playlist/album we can read. Make sure it's public.",
				400,
			);
		}
		if (playlist.tracks.length === 0) {
			return jsonError("That playlist looks empty or private.", 400);
		}
		return c.json({ playlist });
	} catch (error) {
		console.error("Playlist import error", error);
		return jsonError(error instanceof Error ? error.message : "Unable to import that playlist", 502);
	}
});

unlimited.post("/resolve", async (c) => {
	let body: { tracks?: unknown };
	try {
		body = await c.req.json();
	} catch {
		return jsonError("Invalid JSON body", 400);
	}
	const requested = Array.isArray(body.tracks) ? body.tracks.slice(0, 10) : [];
	const results = await Promise.all(
		requested.map(async (entry) => {
			const name = typeof entry?.name === "string" ? entry.name : "";
			const artists = typeof entry?.artists === "string" ? entry.artists : "";
			if (!name) return null;
			try {
				return await resolveOnDeezer(name, artists);
			} catch {
				return null;
			}
		}),
	);
	return c.json({ tracks: results });
});

/* ─── Quizzes ─── */

unlimited.post("/quiz", async (c) => {
	let body: { title?: unknown; from?: unknown; trackIds?: unknown; ladder?: unknown; randomStart?: unknown };
	try {
		body = await c.req.json();
	} catch {
		return jsonError("Invalid JSON body", 400);
	}
	const trackIds = Array.isArray(body.trackIds)
		? body.trackIds.filter((id): id is string => typeof id === "string" && /^\d{1,16}$/.test(id))
		: [];
	if (trackIds.length === 0) return jsonError("Add at least one song", 400);
	if (trackIds.length > QUIZ_TRACK_CAP) return jsonError(`Quizzes are capped at ${QUIZ_TRACK_CAP} songs`, 400);
	const ladder = sanitizeLadder(body.ladder);
	const payload: QuizPayload = {
		title: cleanText(body.title, 60) || "Song quiz",
		from: cleanText(body.from, 30),
		trackIds,
		ladder,
		randomStart: body.randomStart === true,
	};

	for (let attempt = 0; attempt < 4; attempt++) {
		const id = randomId(8);
		try {
			await c.env.DB.prepare("INSERT INTO quizzes (id, payload) VALUES (?1, ?2)")
				.bind(id, JSON.stringify(payload))
				.run();
			return c.json({ id });
		} catch (error) {
			const message = error instanceof Error ? error.message : "";
			if (!/UNIQUE|constraint/i.test(message)) {
				console.error("Quiz insert error", error);
				return jsonError("Unable to save the quiz", 500);
			}
		}
	}
	return jsonError("Unable to save the quiz", 500);
});

unlimited.get("/quiz/:id", async (c) => {
	const id = c.req.param("id");
	if (!/^[a-z0-9]{6,12}$/i.test(id)) return jsonError("Quiz not found", 404);
	try {
		const row = await c.env.DB.prepare("SELECT payload FROM quizzes WHERE id = ?1")
			.bind(id)
			.first<{ payload: string }>();
		if (!row) return jsonError("Quiz not found", 404);
		const payload = JSON.parse(row.payload) as QuizPayload;
		const tracks = (
			await Promise.all(
				payload.trackIds.map(async (trackId) => {
					try {
						return await fetchDeezerTrack(trackId);
					} catch {
						return null;
					}
				}),
			)
		).filter((track): track is MappedTrack => Boolean(track?.previewUrl));
		const stats = await c.env.DB.prepare(
			"SELECT COUNT(*) AS count, AVG(score) AS average FROM quiz_results WHERE quiz_id = ?1",
		)
			.bind(id)
			.first<{ count: number; average: number | null }>();
		return c.json({
			quiz: {
				id,
				title: payload.title,
				from: payload.from,
				ladder: payload.ladder,
				randomStart: payload.randomStart,
				tracks,
			},
			stats: { count: stats?.count ?? 0, average: stats?.average ?? null },
		});
	} catch (error) {
		console.error("Quiz read error", error);
		return jsonError("Unable to load the quiz", 500);
	}
});

unlimited.post("/quiz/:id/result", async (c) => {
	const id = c.req.param("id");
	if (!/^[a-z0-9]{6,12}$/i.test(id)) return jsonError("Quiz not found", 404);
	let body: { score?: unknown };
	try {
		body = await c.req.json();
	} catch {
		return jsonError("Invalid JSON body", 400);
	}
	const score = typeof body.score === "number" ? body.score : NaN;
	if (!Number.isFinite(score) || score < 0 || score > 100) {
		return jsonError("Score must be between 0 and 100", 400);
	}
	try {
		await c.env.DB.prepare("INSERT INTO quiz_results (quiz_id, score) VALUES (?1, ?2)")
			.bind(id, Math.round(score))
			.run();
		const stats = await c.env.DB.prepare(
			"SELECT COUNT(*) AS count, AVG(score) AS average FROM quiz_results WHERE quiz_id = ?1",
		)
			.bind(id)
			.first<{ count: number; average: number | null }>();
		return c.json({ count: stats?.count ?? 0, average: stats?.average ?? null });
	} catch (error) {
		console.error("Quiz result error", error);
		return jsonError("Unable to record the result", 500);
	}
});

/* ─── Pool building ─── */

async function buildPool(categoryId: string, count: number): Promise<MappedTrack[]> {
	if (categoryId === MIX_CATEGORY_ID) {
		// One song from each of `count` different categories.
		const shuffled = shuffle([...UNLIMITED_CATEGORIES]).slice(0, count);
		const pools = await Promise.all(
			shuffled.map(async (category) => {
				const source = pickRandom(category.sources);
				try {
					return shuffle(await fetchSourceTracks(source));
				} catch {
					return [] as MappedTrack[];
				}
			}),
		);
		// Interleave so the picker takes one from each category first.
		const interleaved: MappedTrack[] = [];
		const maxLength = Math.max(0, ...pools.map((pool) => pool.length));
		for (let index = 0; index < maxLength; index++) {
			for (const pool of pools) {
				if (pool[index]) interleaved.push(pool[index]);
			}
		}
		return interleaved;
	}

	if (categoryId.startsWith("artist:")) {
		const artistId = categoryId.slice("artist:".length);
		if (!/^\d+$/.test(artistId)) throw new Error("Unknown artist");
		return shuffle(await fetchArtistTop(artistId));
	}

	const category = findCategory(categoryId);
	if (!category) throw new Error("Unknown category");

	// Two random sources per round keeps variety high without hammering Deezer.
	const sources = shuffle([...category.sources]).slice(0, 2);
	const pools = await Promise.all(
		sources.map(async (source) => {
			try {
				return await fetchSourceTracks(source);
			} catch (error) {
				console.error("Source fetch failed", source, error);
				return [] as MappedTrack[];
			}
		}),
	);
	return shuffle(pools.flat());
}

function pickRound(pool: MappedTrack[], count: number, excludedArtists: Set<string>, seen: Set<string>) {
	const eligible = pool.filter(
		(track) =>
			track.previewUrl &&
			track.name &&
			!isUnfairAnswer(track.name) &&
			!excludedArtists.has(normalizeArtist(track.artists)),
	);
	const fresh = eligible.filter((track) => !seen.has(track.id));
	const candidates = fresh.length >= count ? fresh : eligible;

	// Prefer distinct artists and distinct songs within a round.
	const picks: MappedTrack[] = [];
	const usedArtists = new Set<string>();
	const usedIds = new Set<string>();
	const usedNames = new Set<string>();
	for (const pass of [true, false]) {
		for (const track of candidates) {
			if (picks.length >= count) break;
			const artistKey = normalizeArtist(track.artists);
			const nameKey = normalizeTitle(track.name);
			if (usedIds.has(track.id) || usedNames.has(nameKey)) continue;
			if (pass && usedArtists.has(artistKey)) continue;
			picks.push(track);
			usedIds.add(track.id);
			usedArtists.add(artistKey);
			usedNames.add(nameKey);
		}
		if (picks.length >= count) break;
	}
	return picks;
}

async function fetchSourceTracks(source: UnlimitedSource): Promise<MappedTrack[]> {
	switch (source.kind) {
		case "playlist":
			return fetchCachedList(
				`https://api.deezer.com/playlist/${source.id}/tracks?limit=200`,
				PLAYLIST_CACHE_SECONDS,
				3,
			);
		case "chart":
			return fetchCachedList("https://api.deezer.com/chart/0/tracks?limit=100", CHART_CACHE_SECONDS, 1);
		case "radio":
			// Radios randomize per call; never cache them.
			return fetchList(`https://api.deezer.com/radio/${source.id}/tracks?limit=50`, 1);
	}
}

async function fetchArtistTop(artistId: string) {
	return fetchCachedList(
		`https://api.deezer.com/artist/${artistId}/top?limit=100`,
		PLAYLIST_CACHE_SECONDS,
		1,
	);
}

/** Fetches a Deezer list endpoint, following `next` links up to `maxPages`. */
async function fetchList(url: string, maxPages: number): Promise<MappedTrack[]> {
	const tracks: MappedTrack[] = [];
	let nextUrl: string | undefined = url;
	for (let page = 0; page < maxPages && nextUrl; page++) {
		const response: Response = await fetch(nextUrl);
		if (!response.ok) throw new Error(`Deezer list failed (${response.status})`);
		const data = (await response.json()) as DeezerListResponse;
		if (data.error) throw new Error(data.error.message ?? "Deezer list error");
		tracks.push(...(data.data ?? []).map(mapDeezerTrack));
		nextUrl = data.next;
	}
	return tracks;
}

/** Same as fetchList but stores the merged result in the Worker cache. */
async function fetchCachedList(url: string, ttlSeconds: number, maxPages: number): Promise<MappedTrack[]> {
	const cache = getCache();
	const cacheKey = new Request(`https://unlimited-cache.local/${encodeURIComponent(url)}`);
	if (cache) {
		const hit = await cache.match(cacheKey);
		if (hit) {
			try {
				return (await hit.json()) as MappedTrack[];
			} catch {
				// fall through and refetch
			}
		}
	}
	const tracks = await fetchList(url, maxPages);
	if (cache && tracks.length > 0) {
		await cache.put(
			cacheKey,
			new Response(JSON.stringify(tracks), {
				headers: { "content-type": "application/json", "cache-control": `max-age=${ttlSeconds}` },
			}),
		);
	}
	return tracks;
}

function getCache(): Cache | null {
	try {
		return (caches as unknown as { default?: Cache }).default ?? null;
	} catch {
		return null;
	}
}

/* ─── Import providers ─── */

async function importPlaylist(raw: string): Promise<ImportedPlaylist | null> {
	const url = normalizeLink(raw);
	if (!url) return null;

	const host = url.hostname.replace(/^www\./, "");
	if (host === "open.spotify.com" || host === "spotify.link") {
		return importSpotify(url);
	}
	if (host === "music.apple.com" || host === "itunes.apple.com") {
		return importApple(url);
	}
	if (host === "deezer.com" || host.endsWith(".deezer.com") || host === "deezer.page.link" || host === "link.deezer.com") {
		return importDeezer(url);
	}
	return null;
}

function normalizeLink(raw: string): URL | null {
	const spotifyUri = raw.match(/^spotify:(playlist|album):([A-Za-z0-9]+)$/);
	if (spotifyUri) {
		return new URL(`https://open.spotify.com/${spotifyUri[1]}/${spotifyUri[2]}`);
	}
	const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
	try {
		return new URL(candidate);
	} catch {
		return null;
	}
}

async function importSpotify(url: URL): Promise<ImportedPlaylist | null> {
	let target = url;
	if (url.hostname === "spotify.link") {
		target = await followRedirects(url);
	}
	const match = target.pathname.match(/\/(?:embed\/)?(?:intl-[a-z]+\/)?(playlist|album)\/([A-Za-z0-9]+)/);
	if (!match) return null;
	const [, type, id] = match;

	const response = await fetch(`https://open.spotify.com/embed/${type}/${id}`, {
		headers: { "user-agent": BROWSER_UA, accept: "text/html" },
	});
	if (!response.ok) throw new Error(`Spotify returned ${response.status}. Is the ${type} public?`);
	const html = await response.text();
	const dataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
	if (!dataMatch) throw new Error("Couldn't read that Spotify page. Is the playlist public?");

	type SpotifyEntity = {
		name?: string;
		title?: string;
		coverArt?: { sources?: { url?: string; width?: number }[] };
		trackList?: {
			title?: string;
			subtitle?: string;
			audioPreview?: { url?: string } | null;
			isPlayable?: boolean;
		}[];
	};
	const parsed = JSON.parse(dataMatch[1]) as {
		props?: { pageProps?: { state?: { data?: { entity?: SpotifyEntity } } } };
	};
	const entity = parsed.props?.pageProps?.state?.data?.entity;
	if (!entity) throw new Error("Couldn't read that Spotify page. Is the playlist public?");

	const artwork = pickLargest(entity.coverArt?.sources ?? []);
	const tracks: ImportedTrack[] = (entity.trackList ?? [])
		.filter((track) => track.title)
		.slice(0, IMPORT_TRACK_CAP)
		.map((track) => ({
			name: track.title ?? "",
			artists: track.subtitle ?? "",
			album: type === "album" ? entity.name || entity.title || "" : "",
			artwork,
			previewUrl: track.audioPreview?.url ?? null,
		}));

	return {
		key: `spotify:${type}:${id}`,
		provider: "spotify",
		name: entity.name || entity.title || "Spotify playlist",
		artwork,
		sourceUrl: `https://open.spotify.com/${type}/${id}`,
		tracks,
	};
}

async function importApple(url: URL): Promise<ImportedPlaylist | null> {
	const match = url.pathname.match(/\/([a-z]{2})\/(playlist|album)\/[^/]+\/((?:pl\.)?[A-Za-z0-9-]+)/i);
	if (!match) return null;
	const [, storefront, type, id] = match;

	const response = await fetch(`https://music.apple.com/${storefront}/${type}/x/${id}`, {
		headers: { "user-agent": BROWSER_UA, accept: "text/html" },
	});
	if (!response.ok) throw new Error(`Apple Music returned ${response.status}. Is the ${type} public?`);
	const html = await response.text();
	const dataMatch = html.match(/<script[^>]*id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/);
	if (!dataMatch) throw new Error("Couldn't read that Apple Music page. Is the playlist public?");

	type AppleItem = {
		title?: string;
		artistName?: string;
		tertiaryLinks?: { title?: string }[];
		artwork?: { dictionary?: { url?: string } };
	};
	type AppleSection = { itemKind?: string; items?: AppleItem[] };
	const parsed = JSON.parse(dataMatch[1]) as {
		data?: { data?: { sections?: AppleSection[] } }[];
	};
	const sections = parsed.data?.[0]?.data?.sections ?? [];
	const header = sections.find((section) => section.itemKind === "containerDetailHeaderLockup")?.items?.[0];
	const trackItems = sections.flatMap((section) =>
		(section.items ?? []).filter((item) => item.title && item.artistName),
	);

	const artwork = appleArtwork(header?.artwork?.dictionary?.url);
	const tracks: ImportedTrack[] = trackItems.slice(0, IMPORT_TRACK_CAP).map((item) => ({
		name: item.title ?? "",
		artists: item.artistName ?? "",
		album: type === "album" ? header?.title ?? "" : item.tertiaryLinks?.[0]?.title ?? "",
		artwork: appleArtwork(item.artwork?.dictionary?.url) ?? artwork,
		previewUrl: null,
	}));

	return {
		key: `apple:${type}:${id}`,
		provider: "apple",
		name: header?.title ?? "Apple Music playlist",
		artwork,
		sourceUrl: url.toString(),
		tracks,
	};
}

async function importDeezer(url: URL): Promise<ImportedPlaylist | null> {
	let target = url;
	if (url.hostname === "link.deezer.com" || url.hostname === "deezer.page.link") {
		target = await followRedirects(url);
	}
	const match = target.pathname.match(/\/(playlist|album)\/(\d+)/);
	if (!match) return null;
	const [, type, id] = match;

	const infoResponse = await fetch(`https://api.deezer.com/${type}/${id}`);
	if (!infoResponse.ok) throw new Error(`Deezer returned ${infoResponse.status}`);
	const info = (await infoResponse.json()) as {
		title?: string;
		picture_medium?: string;
		cover_medium?: string;
		error?: { message?: string };
	};
	if (info.error) throw new Error(info.error.message ?? "Deezer playlist not found. Is it public?");

	const list = await fetchList(`https://api.deezer.com/${type}/${id}/tracks?limit=200`, 3);
	const tracks: ImportedTrack[] = list.slice(0, IMPORT_TRACK_CAP).map((track) => ({
		name: track.name,
		artists: track.artists,
		album: track.album,
		artwork: track.artwork,
		previewUrl: track.previewUrl,
	}));

	return {
		key: `deezer:${type}:${id}`,
		provider: "deezer",
		name: info.title ?? "Deezer playlist",
		artwork: info.picture_medium ?? info.cover_medium ?? null,
		sourceUrl: `https://www.deezer.com/${type}/${id}`,
		tracks,
	};
}

async function followRedirects(url: URL) {
	const response = await fetch(url.toString(), {
		redirect: "follow",
		headers: { "user-agent": BROWSER_UA },
	});
	return new URL(response.url || url.toString());
}

function pickLargest(sources: { url?: string; width?: number }[]) {
	let best: { url?: string; width?: number } | null = null;
	for (const source of sources) {
		if (!source.url) continue;
		if (!best || (source.width ?? 0) > (best.width ?? 0)) best = source;
	}
	return best?.url ?? null;
}

function appleArtwork(template: string | undefined) {
	if (!template) return null;
	return template.replace("{w}x{h}", "300x300").replace("{f}", "jpg");
}

/* ─── Resolution (imported track → Deezer preview) ─── */

async function resolveOnDeezer(name: string, artists: string): Promise<MappedTrack | null> {
	const primaryArtist = splitArtists(artists)[0] ?? "";
	const cleanName = stripDecorations(name);
	const attempts = [
		primaryArtist ? `track:"${cleanName}" artist:"${primaryArtist}"` : "",
		primaryArtist ? `${cleanName} ${primaryArtist}` : "",
		cleanName,
	].filter(Boolean);

	for (const query of attempts) {
		const results = await searchDeezerTracks(query, 8);
		const wantedName = normalizeTitle(name);
		const wantedArtists = splitArtists(artists).map(normalizeArtist);
		const match =
			results.find(
				(track) =>
					track.previewUrl &&
					normalizeTitle(track.name) === wantedName &&
					artistsOverlap(wantedArtists, track.artists),
			) ??
			results.find((track) => track.previewUrl && normalizeTitle(track.name) === wantedName) ??
			results.find((track) => track.previewUrl && artistsOverlap(wantedArtists, track.artists));
		if (match) return match;
	}
	return null;
}

/* ─── Small utilities ─── */

function jsonError(message: string, status: number) {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function clampInt(raw: string | undefined, min: number, max: number, fallback: number) {
	const value = Number.parseInt(raw ?? "", 10);
	if (!Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(min, value));
}

function splitList(raw: string | undefined) {
	return (raw ?? "")
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function cleanText(value: unknown, maxLength: number) {
	if (typeof value !== "string") return "";
	return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function sanitizeLadder(value: unknown): number[] | null {
	if (!Array.isArray(value)) return null;
	const numbers = value
		.map((entry) => (typeof entry === "number" ? entry : Number(entry)))
		.filter((entry) => Number.isFinite(entry) && entry > 0 && entry <= 30);
	if (numbers.length < 2 || numbers.length > 8) return null;
	for (let index = 1; index < numbers.length; index++) {
		if (numbers[index] <= numbers[index - 1]) return null;
	}
	return numbers.map((entry) => Math.round(entry * 100) / 100);
}

function randomId(length: number) {
	const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function shuffle<T>(items: T[]) {
	for (let index = items.length - 1; index > 0; index--) {
		const swap = Math.floor(Math.random() * (index + 1));
		[items[index], items[swap]] = [items[swap], items[index]];
	}
	return items;
}

function pickRandom<T>(items: readonly T[]) {
	return items[Math.floor(Math.random() * items.length)];
}

function stripDecorations(title: string) {
	return title
		.replace(/\s*[([].*?[)\]]/g, "")
		.replace(/\s*-\s*(remaster(ed)?|feat\.?|ft\.?|with|from).*$/i, "")
		.trim();
}

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

function splitArtists(value: string) {
	return value
		.replace(/\s*[([].*?[)\]]/g, "")
		.split(/,|&|\bfeat\.?\b|\bft\.?\b|\bwith\b|\band\b|\bx\b|\/|;/i)
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function artistsOverlap(wanted: string[], candidate: string) {
	const candidates = splitArtists(candidate).map(normalizeArtist);
	return wanted.some((artist) =>
		candidates.some((entry) => entry === artist || entry.includes(artist) || artist.includes(entry)),
	);
}
