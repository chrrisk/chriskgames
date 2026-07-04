export type StatsGame = "songgame" | "colorgame" | "chaingame";

export type DailyStats = { count: number; average: number | null };

/**
 * Records today's result once per device per game (guarded by a localStorage
 * flag), then returns the day's stats. Returns null when stats are
 * unavailable; callers should render nothing in that case.
 */
export async function submitAndFetchDailyStats(
	game: StatsGame,
	dateKey: string,
	score: number,
): Promise<DailyStats | null> {
	if (typeof window === "undefined") return null;
	const submittedKey = `stats-submitted:${game}:${dateKey}`;
	try {
		if (!window.localStorage.getItem(submittedKey)) {
			const response = await fetch("/api/stats/result", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ game, score }),
			});
			if (response.ok) {
				window.localStorage.setItem(submittedKey, "1");
			}
		}
		const statsResponse = await fetch(`/api/stats/daily?game=${game}`);
		if (!statsResponse.ok) return null;
		return (await statsResponse.json()) as DailyStats;
	} catch {
		return null;
	}
}

/**
 * Average of everyone else's scores, excluding this player's own submission.
 * Null when there is nobody else to compare against.
 */
export function othersAverage(stats: DailyStats | null, ownScore: number): number | null {
	if (!stats || stats.average === null || stats.count <= 1) return null;
	const others = (stats.average * stats.count - ownScore) / (stats.count - 1);
	return Math.round(Math.min(100, Math.max(0, others)));
}
