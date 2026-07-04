/** Date key (YYYY-MM-DD) for the current moment in US Eastern time. */
export function getEasternDateKey() {
	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZone: "America/New_York",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
	const [month, day, year] = formatter.format(new Date()).split("/");
	return `${year}-${month}-${day}`;
}

/** Milliseconds until the next midnight in US Eastern time. */
export function getMillisecondsUntilNextEasternReset() {
	const now = new Date();
	const easternNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
	const easternMidnight = new Date(easternNow);
	easternMidnight.setHours(24, 0, 0, 0);
	return Math.max(0, easternMidnight.getTime() - easternNow.getTime());
}

/** Formats a millisecond duration as HH:MM:SS. */
export function formatCountdownLabel(ms: number) {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const hours = Math.floor(totalSeconds / 3600)
		.toString()
		.padStart(2, "0");
	const minutes = Math.floor((totalSeconds % 3600) / 60)
		.toString()
		.padStart(2, "0");
	const seconds = (totalSeconds % 60).toString().padStart(2, "0");
	return `${hours}:${minutes}:${seconds}`;
}
