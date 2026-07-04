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

/**
 * Scores how close the guess looks to the target, not how close the slider
 * numbers are. Both colors are converted to the OKLab color space, where
 * euclidean distance tracks perceived difference; the distance is then mapped
 * onto 0-100. Colors that look far apart score near zero even when individual
 * HSL components happen to be close.
 */
export function scoreColorGuess(target: ColorHSL, guess: ColorHSL): number {
	const a = hslToOklab(target);
	const b = hslToOklab(guess);
	const deltaE = Math.sqrt((a.L - b.L) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2);
	return Math.round(100 / (1 + Math.pow(deltaE / HALF_SCORE_DELTA_E, 3)));
}

/** OKLab distance that scores exactly 50; the sigmoid falls fast beyond it. */
const HALF_SCORE_DELTA_E = 0.12;

type OKLab = { L: number; a: number; b: number };

function hslToOklab(color: ColorHSL): OKLab {
	const [r, g, b] = hslToRgb(color);
	return rgbToOklab(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b));
}

function hslToRgb({ h, s, l }: ColorHSL): [number, number, number] {
	const sat = s / 100;
	const light = l / 100;
	const chroma = (1 - Math.abs(2 * light - 1)) * sat;
	const huePrime = (((h % 360) + 360) % 360) / 60;
	const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
	const m = light - chroma / 2;
	let rgb: [number, number, number];
	if (huePrime < 1) rgb = [chroma, x, 0];
	else if (huePrime < 2) rgb = [x, chroma, 0];
	else if (huePrime < 3) rgb = [0, chroma, x];
	else if (huePrime < 4) rgb = [0, x, chroma];
	else if (huePrime < 5) rgb = [x, 0, chroma];
	else rgb = [chroma, 0, x];
	return [rgb[0] + m, rgb[1] + m, rgb[2] + m];
}

function srgbToLinear(channel: number) {
	return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

function rgbToOklab(r: number, g: number, b: number): OKLab {
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return {
		L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	};
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
