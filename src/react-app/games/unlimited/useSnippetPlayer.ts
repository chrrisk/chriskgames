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
	const activeRef = useRef<{ offset: number; length: number } | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	/** 0..1 through the current snippet. */
	const [progress, setProgress] = useState(0);
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

	const stop = useCallback(() => {
		clearWatchers();
		activeRef.current = null;
		audioRef.current?.pause();
		setIsPlaying(false);
		setProgress(0);
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
		(url: string, offset: number, length: number) => {
			const audio = audioRef.current;
			if (!audio) return false;
			clearWatchers();

			if (audio.src !== url) {
				audio.src = url;
				audio.load();
				setLoadedUrl(url);
			}

			const graph = ensureGraph();
			if (graph) {
				audio.volume = 1;
				setCompression(graph, compress);
				fadeInToGain(graph, gainFromSlider(volume));
			} else {
				audio.volume = gainFromSlider(volume);
			}

			const begin = () => {
				try {
					audio.currentTime = offset;
				} catch {
					// Seeking before metadata is available throws in some browsers;
					// the loadedmetadata path below retries.
				}
				activeRef.current = { offset, length };
				setIsPlaying(true);
				setProgress(0);
				void audio.play().catch(() => {
					activeRef.current = null;
					setIsPlaying(false);
				});

				const tick = () => {
					const active = activeRef.current;
					if (!active) return;
					const elapsed = audio.currentTime - active.offset;
					if (elapsed >= active.length || audio.ended) {
						audio.pause();
						activeRef.current = null;
						setIsPlaying(false);
						setProgress(0);
						clearWatchers();
						return;
					}
					setProgress(Math.max(0, Math.min(1, elapsed / active.length)));
					frameRef.current = requestAnimationFrame(tick);
				};
				frameRef.current = requestAnimationFrame(tick);
				// Belt and braces: if the tab is hidden, animation frames stop.
				safetyTimeoutRef.current = window.setTimeout(() => {
					if (activeRef.current) {
						audio.pause();
						activeRef.current = null;
						setIsPlaying(false);
						setProgress(0);
					}
				}, (length + 0.35) * 1000);
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

	return { audioRef, isPlaying, progress, loadedUrl, play, stop, preload };
}
