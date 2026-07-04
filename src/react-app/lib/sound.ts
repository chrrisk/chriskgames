import { useCallback, useRef } from "react";
import clickSound from "../assets/click-soft.wav";

export function useClickSound() {
	const soundRef = useRef<HTMLAudioElement | null>(null);
	return useCallback(() => {
		if (typeof Audio === "undefined") return;
		if (!soundRef.current) {
			soundRef.current = new Audio(clickSound);
		}
		soundRef.current.currentTime = 0;
		void soundRef.current.play().catch(() => undefined);
	}, []);
}

/* ─── Snippet playback graph ───
 * Routes an <audio> element through a compressor and a gain node so hot
 * masters get squashed instead of blasting, and playback can fade in rather
 * than slam on. Requires the element to load its source with CORS enabled
 * (crossOrigin="anonymous"); callers must fall back to element volume when
 * the graph is unavailable.
 */

export type AudioGraph = {
	context: AudioContext;
	gain: GainNode;
};

const FADE_IN_SECONDS = 0.35;

/** Perceived-loudness curve: linear sliders sound too loud at the low end. */
export function gainFromSlider(sliderValue: number) {
	const clamped = Math.min(1, Math.max(0, sliderValue));
	return clamped * clamped;
}

export function createAudioGraph(audio: HTMLAudioElement): AudioGraph | null {
	if (typeof AudioContext === "undefined") return null;
	try {
		const context = new AudioContext();
		const source = context.createMediaElementSource(audio);
		const compressor = context.createDynamicsCompressor();
		compressor.threshold.value = -35;
		compressor.knee.value = 20;
		compressor.ratio.value = 12;
		compressor.attack.value = 0.003;
		compressor.release.value = 0.25;
		const gain = context.createGain();
		gain.gain.value = 0;
		source.connect(compressor);
		compressor.connect(gain);
		gain.connect(context.destination);
		return { context, gain };
	} catch {
		return null;
	}
}

/** Fades from silence up to the target gain; call at the start of playback. */
export function fadeInToGain(graph: AudioGraph, target: number) {
	const now = graph.context.currentTime;
	graph.gain.gain.cancelScheduledValues(now);
	graph.gain.gain.setValueAtTime(0, now);
	graph.gain.gain.linearRampToValueAtTime(target, now + FADE_IN_SECONDS);
}

/** Immediately moves to the target gain; for live slider adjustments. */
export function setGain(graph: AudioGraph, target: number) {
	const now = graph.context.currentTime;
	graph.gain.gain.cancelScheduledValues(now);
	graph.gain.gain.setTargetAtTime(target, now, 0.02);
}
