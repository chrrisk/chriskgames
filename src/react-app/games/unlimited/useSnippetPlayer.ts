import { useCallback, useEffect, useRef, useState } from "react";
import {
	createAudioGraph,
	fadeInToGain,
	gainFromSlider,
	setCompression,
	setGain,
	type AudioGraph,
} from "../../lib/sound";

/**
 * Drives a single <audio> element for snippet playback. Snippets can start at
 * any offset and be as short as a quarter second; the stop point is checked
 * against the element clock on every animation frame rather than trusting a
 * timer, so short snippets land where they should.
 */
export function useSnippetPlayer(volume: number, compress: boolean) {
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const graphRef = useRef<AudioGraph | null>(null);
	const frameRef = useRef<number | null>(null);
	const safetyTimeoutRef = useRef<number | null>(null);
	const activeRef = useRef<{ offset: number; length: number; onDone?: (heard: number) => void } | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	/** 0..1 through the current snippet. */
	const [progress, setProgress] = useState(0);
	/** Seconds of the current snippet heard so far, from the audio clock. */
	const [elapsedSeconds, setElapsedSeconds] = useState(0);
	const onPlayingRef = useRef<(() => void) | null>(null);
	const [loadedUrl, setLoadedUrl] = useState<string | null>(null);

	const clearWatchers = () => {
		if (frameRef.current !== null) {
			cancelAnimationFrame(frameRef.current);
			frameRef.current = null;
		}
		if (safetyTimeoutRef.current !== null) {
			window.clearTimeout(safetyTimeoutRef.current);
			safetyTimeoutRef.current = null;
		}
	};

	const detachPlaying = () => {
		if (onPlayingRef.current && audioRef.current) {
			audioRef.current.removeEventListener("playing", onPlayingRef.current);
		}
		onPlayingRef.current = null;
	};

	const stop = useCallback(() => {
		clearWatchers();
		detachPlaying();
		const active = activeRef.current;
		activeRef.current = null;
		if (active && audioRef.current) {
			const heard = Math.max(0, Math.min(active.length, audioRef.current.currentTime - active.offset));
			active.onDone?.(heard);
		}
		audioRef.current?.pause();
		setIsPlaying(false);
		setProgress(0);
		setElapsedSeconds(0);
	}, []);

	const ensureGraph = useCallback(() => {
		const audio = audioRef.current;
		if (!audio) return null;
		if (!graphRef.current) {
			graphRef.current = createAudioGraph(audio, { compress });
		}
		void graphRef.current?.context.resume().catch(() => undefined);
		return graphRef.current;
	}, [compress]);

	/** Points the element at a preview so the first play is instant. */
	const preload = useCallback((url: string | null) => {
		const audio = audioRef.current;
		if (!audio || !url) return;
		if (audio.src !== url) {
			audio.src = url;
			audio.load();
			setLoadedUrl(url);
		}
	}, []);

	const play = useCallback(
		(url: string, offset: number, length: number, onDone?: (heard: number) => void) => {
			const audio = audioRef.current;
			if (!audio) return false;
			clearWatchers();
			detachPlaying();
			activeRef.current = null;

			if (audio.src !== url) {
				audio.src = url;
				audio.load();
				setLoadedUrl(url);
			}

			detachPlaying();
			const graph = ensureGraph();
			if (graph) {
				audio.volume = 1;
				setCompression(graph, compress);
				// Silence until playback actually starts, then fade in fast.
				setGain(graph, 0);
			} else {
				audio.volume = gainFromSlider(volume);
			}
			// Short snippets get a near-instant fade (just enough to avoid a click)
			// so a 0.5s clip is actually 0.5s of audible music.
			const fadeSeconds = Math.min(0.2, length * 0.08);

			const begin = () => {
				try {
					audio.currentTime = offset;
				} catch {
					// Seeking before metadata is available throws in some browsers;
					// the loadedmetadata path below retries.
				}
				activeRef.current = { offset, length, onDone };
				setIsPlaying(true);
				setProgress(0);
				setElapsedSeconds(0);

				const finish = () => {
					audio.pause();
					const active = activeRef.current;
					activeRef.current = null;
					if (active) active.onDone?.(active.length);
					setIsPlaying(false);
					setProgress(0);
					setElapsedSeconds(0);
					clearWatchers();
					detachPlaying();
				};

				const tick = () => {
					const active = activeRef.current;
					if (!active) return;
					const elapsed = audio.currentTime - active.offset;
					if (elapsed >= active.length || audio.ended) {
						finish();
						return;
					}
					const clamped = Math.max(0, Math.min(active.length, elapsed));
					setElapsedSeconds(clamped);
					setProgress(clamped / active.length);
					frameRef.current = requestAnimationFrame(tick);
				};

				// Everything time-based is armed from the moment audio actually
				// starts, so buffering delays never eat into the snippet.
				const onPlaying = () => {
					detachPlaying();
					if (!activeRef.current) return;
					if (graph) fadeInToGain(graph, gainFromSlider(volume), fadeSeconds);
					frameRef.current = requestAnimationFrame(tick);
					// Backstop for hidden tabs where animation frames stop.
					safetyTimeoutRef.current = window.setTimeout(() => {
						if (activeRef.current) finish();
					}, (length + 0.5) * 1000);
				};
				onPlayingRef.current = onPlaying;
				audio.addEventListener("playing", onPlaying);

				void audio.play().catch(() => {
					detachPlaying();
					activeRef.current = null;
					setIsPlaying(false);
				});
			};

			if (audio.readyState >= 1) {
				begin();
			} else {
				const onReady = () => {
					audio.removeEventListener("loadedmetadata", onReady);
					begin();
				};
				audio.addEventListener("loadedmetadata", onReady);
			}
			return true;
		},
		[compress, ensureGraph, volume],
	);

	// Live volume changes while a snippet is playing.
	useEffect(() => {
		const gain = gainFromSlider(volume);
		if (graphRef.current) {
			setGain(graphRef.current, gain);
		} else if (audioRef.current) {
			audioRef.current.volume = gain;
		}
	}, [volume]);

	useEffect(() => {
		if (graphRef.current) setCompression(graphRef.current, compress);
	}, [compress]);

	useEffect(() => {
		const audio = audioRef.current;
		return () => {
			clearWatchers();
			audio?.pause();
			void graphRef.current?.context.close().catch(() => undefined);
		};
	}, []);

	return { audioRef, isPlaying, progress, elapsedSeconds, loadedUrl, play, stop, preload };
}
