import { createSeededRandom, hashStringToSeed } from "../lib/random";

export type ColorHSL = { h: number; s: number; l: number };

export const COLOR_GAME_ROUNDS = 5;
export const MEMORIZE_SECONDS = 4;
export const DEFAULT_GUESS: ColorHSL = { h: 180, s: 50, l: 50 };

/** Same five colors for everyone on a given day, derived from the date key. */
export function generateDailyColors(dateKey: string): ColorHSL[] {
	const random = createSeededRandom(hashStringToSeed(`colorgame:${dateKey}`));
	return Array.from({ length: COLOR_GAME_ROUNDS }, () => ({
		h: Math.floor(random() * 360),
		s: Math.floor(random() * 85) + 10,
		l: Math.floor(random() * 70) + 10,
	}));
}

export function hslStr({ h, s, l }: ColorHSL): string {
	return `hsl(${h}, ${s}%, ${l}%)`;
}

export function scoreColorGuess(target: ColorHSL, guess: ColorHSL): number {
	const hueDiff = Math.min(Math.abs(target.h - guess.h), 360 - Math.abs(target.h - guess.h));
	const hueScore = 1 - hueDiff / 180;
	const satScore = 1 - Math.abs(target.s - guess.s) / 100;
	const lightScore = 1 - Math.abs(target.l - guess.l) / 100;
	const weighted = hueScore * 0.5 + satScore * 0.25 + lightScore * 0.25;
	return Math.round(Math.pow(weighted, 2) * 100);
}

export function scoreColor(score: number): string {
	if (score >= 90) return "#85d8a6";
	if (score >= 70) return "#e7c26a";
	if (score >= 50) return "#e07b44";
	return "#ef7b6d";
}

export function scoreGradient(score: number): string {
	if (score >= 90) return "linear-gradient(90deg, #85d8a6, #b8e6c9)";
	if (score >= 70) return "linear-gradient(90deg, #e7c26a, #85d8a6)";
	if (score >= 50) return "linear-gradient(90deg, #e07b44, #e7c26a)";
	return "linear-gradient(90deg, #ef7b6d, #e07b44)";
}
