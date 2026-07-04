import { Hono } from "hono";
import type { Context } from "hono";
import {
	BASE_CATEGORY_KEYS,
	CATEGORY_DEFAULT_TRACKS,
	HOLIDAY_CATEGORY,
	WEEKLY_TRACK_SCHEDULE,
	type CategoryKey,
} from "./schedule";

type DeezerTrack = {
	id?: number;
	title?: string | null;
	title_short?: string | null;
	artist?: { name?: string | null } | null;
	album?: { title?: string | null; cover_medium?: string | null; cover?: string | null } | null;
	preview?: string | null;
	duration?: number | null;
	link?: string | null;
};

type DeezerSearchResponse = {
	data?: DeezerTrack[];
};

type Bindings = {
	ASSETS: Fetcher;
	DB: D1Database;
};

const STATS_GAMES = ["songgame", "colorgame", "chaingame"] as const;
type StatsGame = (typeof STATS_GAMES)[number];

function isStatsGame(value: string): value is StatsGame {
	return (STATS_GAMES as readonly string[]).includes(value);
}

const app = new Hono<{ Bindings: Bindings }>();

app.get("/api/", (c) => c.json({ name: "Cloudflare" }));

app.get("/api/music/search", async (c) => {
	const query = c.req.query("q");
	if (!query) {
		return jsonError("Missing query parameter", 400);
	}

	try {
		const deezerResponse = await fetch(
			`https://api.deezer.com/search/track?${new URLSearchParams({
				q: query,
				limit: "20",
			}).toString()}`,
		);

		if (!deezerResponse.ok) {
			return jsonError("Deezer search failed", deezerResponse.status);
		}

		const data = (await deezerResponse.json()) as DeezerSearchResponse;
		const tracks = (data.data ?? [])
			.map((item) => mapDeezerTrack(item))
			.filter((track) => (track.name ? !isAlternateVersion(track.name) : true));

		return c.json({ tracks });
	} catch (error) {
		console.error("Deezer search error", error);
		return jsonError("Unable to reach Deezer", 500);
	}
});

app.get("/api/music/daily", handleDailyTracks);
// Older clients called this route "weekly"; keep it answering.
app.get("/api/music/weekly", handleDailyTracks);

app.get("/api/music/archive", (c) => {
	return c.json({
		dates: getArchiveDates(),
	});
});

app.post("/api/stats/result", async (c) => {
	let body: { game?: unknown; score?: unknown };
	try {
		body = await c.req.json();
	} catch {
		return jsonError("Invalid JSON body", 400);
	}
	const game = typeof body.game === "string" ? body.game : "";
	const score = typeof body.score === "number" ? body.score : NaN;
	if (!isStatsGame(game)) {
		return jsonError("Unknown game", 400);
	}
	if (!Number.isFinite(score) || score < 0 || score > 100) {
		return jsonError("Score must be between 0 and 100", 400);
	}
	try {
		await c.env.DB.prepare("INSERT INTO results (date, game, score) VALUES (?1, ?2, ?3)")
			.bind(getEasternDateKey(), game, Math.round(score))
			.run();
		return c.json({ ok: true });
	} catch (error) {
		console.error("Stats insert error", error);
		return jsonError("Unable to record result", 500);
	}
});

app.get("/api/stats/daily", async (c) => {
	const game = c.req.query("game") ?? "";
	if (!isStatsGame(game)) {
		return jsonError("Unknown game", 400);
	}
	try {
		const row = await c.env.DB.prepare(
			"SELECT COUNT(*) AS count, AVG(score) AS average FROM results WHERE date = ?1 AND game = ?2",
		)
			.bind(getEasternDateKey(), game)
			.first<{ count: number; average: number | null }>();
		return c.json({
			count: row?.count ?? 0,
			average: row?.average ?? null,
		});
	} catch (error) {
		console.error("Stats read error", error);
		return jsonError("Unable to load stats", 500);
	}
});

// Anything that isn't an API route or a static asset falls through to the
// SPA index so deep links like /songgame resolve.
app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

export default app;

async function handleDailyTracks(c: Context) {
	try {
		const requestedDate = c.req.query("date");
		const fallbackDate = getEasternDateKey();
		const dateKey = requestedDate
			? isKnownScheduleDate(requestedDate)
				? requestedDate
				: fallbackDate
			: getActiveScheduleDateKey();
		const activeCategoryKeys = getActiveCategoryKeys(dateKey);
		const scheduleEntry = WEEKLY_TRACK_SCHEDULE[dateKey];
		const trackIds: Partial<Record<CategoryKey, string>> = {};
		for (const category of activeCategoryKeys) {
			trackIds[category] = scheduleEntry?.[category] ?? CATEGORY_DEFAULT_TRACKS[category];
		}

		const categoryEntries = await Promise.all(
			activeCategoryKeys.map(async (category) => {
				const id = trackIds[category];
				if (!id) {
					console.error(`Missing track id for category ${category} on ${dateKey}`);
					return [category, null] as const;
				}
				try {
					const track = await fetchDeezerTrack(id);
					return [category, track] as const;
				} catch (error) {
					console.error(`Daily track error for ${category}`, error);
					return [category, null] as const;
				}
			}),
		);

		const categoryTracks = Object.fromEntries(categoryEntries) as Partial<
			Record<CategoryKey, ReturnType<typeof mapDeezerTrack> | null>
		>;
		const primaryTrack = categoryTracks.modern ?? categoryTracks.oldies;

		if (!primaryTrack) {
			return jsonError("Unable to load the daily tracks", 502);
		}

		return c.json({
			track: primaryTrack,
			categories: categoryTracks,
			requestedDate: dateKey,
		});
	} catch (error) {
		console.error("Daily track error", error);
		return jsonError("Unable to load the daily tracks", 500);
	}
}

function getActiveCategoryKeys(dateKey: string): CategoryKey[] {
	const baseKeys = [...BASE_CATEGORY_KEYS];
	if (isHolidaySeason(dateKey)) {
		return [HOLIDAY_CATEGORY, ...baseKeys];
	}
	return baseKeys;
}

function jsonError(message: string, status: number) {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: {
			"content-type": "application/json",
		},
	});
}

function getEasternDateKey() {
	return getEasternDateKeyFromDate(new Date());
}

function getEasternDateKeyFromDate(value: Date) {
	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZone: "America/New_York",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
	const parts = formatter.format(value).split("/");
	const [month, day, year] = parts;
	return `${year}-${month}-${day}`;
}

/**
 * The schedule lists a start date per batch of songs (daily entries
 * historically, weekly batches now). The active entry is the most recent
 * schedule date that is not in the future.
 */
function getActiveScheduleDateKey() {
	const todayKey = getEasternDateKey();
	const pastOrToday = Object.keys(WEEKLY_TRACK_SCHEDULE)
		.filter((key) => key <= todayKey)
		.sort();
	return pastOrToday[pastOrToday.length - 1] ?? todayKey;
}

function isHolidaySeason(dateKey: string) {
	const [, monthStr, dayStr] = dateKey.split("-");
	const month = Number(monthStr);
	const day = Number(dayStr);
	if (Number.isNaN(month) || Number.isNaN(day)) {
		return false;
	}
	return month === 12 || (month === 1 && day === 1);
}

function isKnownScheduleDate(dateKey: string) {
	return Object.prototype.hasOwnProperty.call(WEEKLY_TRACK_SCHEDULE, dateKey);
}

function getArchiveDates() {
	return Object.keys(WEEKLY_TRACK_SCHEDULE).sort();
}

function isAlternateVersion(title: string) {
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

async function fetchDeezerTrack(trackId: string) {
	const response = await fetch(`https://api.deezer.com/track/${trackId}`);
	if (!response.ok) {
		throw new Error(`Failed to fetch track ${trackId} (${response.status})`);
	}

	const data = (await response.json()) as DeezerTrack;
	return mapDeezerTrack(data);
}

function mapDeezerTrack(item: DeezerTrack) {
	return {
		id: item.id,
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
