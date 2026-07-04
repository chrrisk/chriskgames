import { createSeededRandom, hashStringToSeed } from "../lib/random";

/**
 * Each puzzle is a chain of words where every adjacent pair forms a common
 * two-word phrase or compound: "star spangled", "spangled banner",
 * "banner year", "year book". Keyed by Eastern date (YYYY-MM-DD).
 */
export const PUZZLE_SCHEDULE: Record<string, string[]> = {
	"2026-07-04": ["star", "spangled", "banner", "year", "book"],
	"2026-07-05": ["road", "trip", "wire", "tap", "dance"],
	"2026-07-06": ["birthday", "cake", "walk", "out", "side"],
	"2026-07-07": ["sun", "flower", "power", "plant", "food"],
	"2026-07-08": ["fire", "truck", "stop", "watch", "dog"],
	"2026-07-09": ["snow", "ball", "park", "bench", "press"],
	"2026-07-10": ["book", "worm", "hole", "punch", "line"],
	"2026-07-11": ["rain", "bow", "tie", "break", "down"],
	"2026-07-12": ["key", "board", "game", "night", "owl"],
	"2026-07-13": ["sea", "shell", "fish", "tank", "top"],
	"2026-07-14": ["moon", "light", "house", "work", "out"],
	"2026-07-15": ["pop", "corn", "bread", "box", "office"],
	"2026-07-16": ["milk", "shake", "down", "town", "hall"],
	"2026-07-17": ["cell", "phone", "call", "center", "stage"],
	"2026-07-18": ["green", "house", "party", "animal", "crackers"],
	"2026-07-19": ["black", "bird", "bath", "towel", "rack"],
	"2026-07-20": ["hot", "dog", "house", "boat", "load"],
	"2026-07-21": ["ice", "cream", "cheese", "burger", "king"],
	"2026-07-22": ["gold", "fish", "hook", "shot", "gun"],
	"2026-07-23": ["night", "club", "sandwich", "board", "game"],
	"2026-07-24": ["water", "fall", "out", "law", "school"],
	"2026-07-25": ["peanut", "butter", "fly", "paper", "cut"],
	"2026-07-26": ["straw", "berry", "patch", "work", "week"],
	"2026-07-27": ["camp", "fire", "escape", "room", "service"],
	"2026-07-28": ["air", "line", "dance", "floor", "plan"],
	"2026-07-29": ["back", "yard", "sale", "price", "tag"],
	"2026-07-30": ["bed", "room", "service", "dog", "park"],
	"2026-07-31": ["high", "school", "bus", "stop", "sign"],
	"2026-08-01": ["side", "walk", "way", "point", "guard"],
	"2026-08-02": ["french", "press", "release", "date", "night"],
	"2026-08-03": ["heat", "wave", "pool", "table", "tennis"],
	"2026-08-04": ["beach", "house", "key", "chain", "link"],
};

const FALLBACK_POOL = Object.values(PUZZLE_SCHEDULE);

/**
 * Scheduled puzzle for the date, or a deterministic pick from the pool so
 * the game keeps working past the last scheduled day (repeats are possible
 * until the schedule is extended).
 */
export function getPuzzleForDate(dateKey: string): string[] {
	const scheduled = PUZZLE_SCHEDULE[dateKey];
	if (scheduled) return scheduled;
	const random = createSeededRandom(hashStringToSeed(`chaingame:${dateKey}`));
	return FALLBACK_POOL[Math.floor(random() * FALLBACK_POOL.length)];
}
