/** Hashes a string to a 32-bit seed (xmur3). */
export function hashStringToSeed(value: string) {
	let h = 1779033703 ^ value.length;
	for (let i = 0; i < value.length; i++) {
		h = Math.imul(h ^ value.charCodeAt(i), 3432918353);
		h = (h << 13) | (h >>> 19);
	}
	h = Math.imul(h ^ (h >>> 16), 2246822507);
	h = Math.imul(h ^ (h >>> 13), 3266489909);
	return (h ^= h >>> 16) >>> 0;
}

/** Deterministic PRNG (mulberry32). Returns floats in [0, 1). */
export function createSeededRandom(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
