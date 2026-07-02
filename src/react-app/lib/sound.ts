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
