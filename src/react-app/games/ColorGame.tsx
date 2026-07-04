import { useEffect, useMemo, useState } from "react";
import { PageShell } from "../components/PageShell";
import { useClickSound } from "../lib/sound";
import {
	formatCountdownLabel,
	getEasternDateKey,
	getMillisecondsUntilNextEasternReset,
} from "../lib/time";
import {
	COLOR_GAME_ROUNDS,
	DEFAULT_GUESS,
	MEMORIZE_SECONDS,
	generateDailyColors,
	hslStr,
	scoreColor,
	scoreColorGuess,
	scoreGradient,
	type ColorHSL,
} from "./colorgame-helpers";
import "../styles/colorgame.css";

type ColorPhase = "memorize" | "guess" | "result" | "complete";

type StoredState = {
	dateKey?: string;
	scores?: number[];
};

const STORAGE_KEY = "colorgame-daily-state";
const MEMORIZE_MS = MEMORIZE_SECONDS * 1000;

function loadStoredScores(dateKey: string): number[] {
	if (typeof window === "undefined") return [];
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const data = JSON.parse(raw) as StoredState;
		if (data.dateKey !== dateKey || !Array.isArray(data.scores)) return [];
		return data.scores.filter((score) => typeof score === "number").slice(0, COLOR_GAME_ROUNDS);
	} catch {
		return [];
	}
}

export function ColorGame() {
	const playClick = useClickSound();
	const [dateKey, setDateKey] = useState(() => getEasternDateKey());
	const [scores, setScores] = useState<number[]>(() => loadStoredScores(getEasternDateKey()));
	const [phase, setPhase] = useState<ColorPhase>(() =>
		loadStoredScores(getEasternDateKey()).length >= COLOR_GAME_ROUNDS ? "complete" : "memorize",
	);
	const [guess, setGuess] = useState<ColorHSL>(DEFAULT_GUESS);
	const [remainingMs, setRemainingMs] = useState(MEMORIZE_MS);
	const [resetCountdown, setResetCountdown] = useState(() =>
		formatCountdownLabel(getMillisecondsUntilNextEasternReset()),
	);

	const targets = useMemo(() => generateDailyColors(dateKey), [dateKey]);
	// During result the just-played round is scores.length - 1; otherwise the
	// round being played is scores.length.
	const roundIndex =
		phase === "result"
			? Math.max(0, scores.length - 1)
			: Math.min(scores.length, COLOR_GAME_ROUNDS - 1);
	const round = roundIndex + 1;
	const target = targets[roundIndex];
	const lastScore = scores[scores.length - 1] ?? 0;

	// Memorize countdown, driven by a wall-clock deadline so the bar and the
	// label always agree with real time.
	useEffect(() => {
		if (phase !== "memorize") return;
		const deadline = Date.now() + MEMORIZE_MS;
		const intervalId = window.setInterval(() => {
			const remaining = deadline - Date.now();
			if (remaining <= 0) {
				window.clearInterval(intervalId);
				setRemainingMs(0);
				setPhase("guess");
				return;
			}
			setRemainingMs(remaining);
		}, 100);
		return () => window.clearInterval(intervalId);
	}, [phase, round]);

	// Persist today's progress.
	useEffect(() => {
		if (typeof window === "undefined") return;
		const payload: StoredState = { dateKey, scores };
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
	}, [dateKey, scores]);

	// Roll over to the next day's colors at midnight Eastern.
	useEffect(() => {
		const intervalId = window.setInterval(() => {
			const newKey = getEasternDateKey();
			if (newKey !== dateKey) {
				setDateKey(newKey);
				setScores([]);
				setGuess(DEFAULT_GUESS);
				setRemainingMs(MEMORIZE_MS);
				setPhase("memorize");
				if (typeof window !== "undefined") {
					window.localStorage.removeItem(STORAGE_KEY);
				}
			}
		}, 60000);
		return () => window.clearInterval(intervalId);
	}, [dateKey]);

	useEffect(() => {
		if (phase !== "complete") return;
		const update = () => setResetCountdown(formatCountdownLabel(getMillisecondsUntilNextEasternReset()));
		update();
		const intervalId = window.setInterval(update, 1000);
		return () => window.clearInterval(intervalId);
	}, [phase]);

	const handleSubmitGuess = () => {
		playClick();
		setScores((prev) => [...prev, scoreColorGuess(target, guess)]);
		setPhase("result");
	};

	const handleNextRound = () => {
		playClick();
		if (scores.length >= COLOR_GAME_ROUNDS) {
			setPhase("complete");
		} else {
			setGuess(DEFAULT_GUESS);
			setRemainingMs(MEMORIZE_MS);
			setPhase("memorize");
		}
	};

	const totalScore = scores.length
		? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
		: 0;

	const secondsLeft = Math.ceil(remainingMs / 1000);

	return (
		<PageShell
			page="colorgame"
			mainClassName="lab-doc"
			headerExtra={
				<div className="reset-countdown">
					{phase === "complete" ? (
						<>
							<span>New colors in</span>
							<strong>{resetCountdown}</strong>
						</>
					) : (
						<>
							<span>Round</span>
							<strong>{`${round} / ${COLOR_GAME_ROUNDS}`}</strong>
						</>
					)}
				</div>
			}
		>
			<section className="doc-card cg-card">
				{phase === "memorize" && (
					<>
						<p className="eyebrow">Round {round} of {COLOR_GAME_ROUNDS}</p>
						<h2 className="cg-title">Memorize this color</h2>
						<p className="lab-hint">{secondsLeft}s remaining</p>
						<div className="cg-swatch-wrap">
							<div className="cg-swatch" style={{ background: hslStr(target) }} />
							<div className="cg-timer-bar">
								<div className="cg-timer-fill" style={{ width: `${(remainingMs / MEMORIZE_MS) * 100}%` }} />
							</div>
						</div>
					</>
				)}

				{phase === "guess" && (
					<>
						<p className="eyebrow">Round {round} of {COLOR_GAME_ROUNDS}</p>
						<h2 className="cg-title">Recreate the color</h2>
						<p className="lab-hint">Adjust the sliders to match what you saw.</p>
						<div className="cg-guess-layout">
							<div className="cg-preview-swatch" style={{ background: hslStr(guess) }} />
							<div className="cg-sliders">
								<div className="cg-slider-row">
									<label className="cg-label">Brightness <span>{guess.l}%</span></label>
									<input
										type="range"
										className="cg-slider"
										min="0"
										max="100"
										value={guess.l}
										onChange={(e) => setGuess((prev) => ({ ...prev, l: Number(e.target.value) }))}
										style={{ background: `linear-gradient(to right, hsl(${guess.h}, ${guess.s}%, 0%), hsl(${guess.h}, ${guess.s}%, 50%), hsl(${guess.h}, ${guess.s}%, 100%))` }}
									/>
								</div>
								<div className="cg-slider-row">
									<label className="cg-label">Saturation <span>{guess.s}%</span></label>
									<input
										type="range"
										className="cg-slider"
										min="0"
										max="100"
										value={guess.s}
										onChange={(e) => setGuess((prev) => ({ ...prev, s: Number(e.target.value) }))}
										style={{ background: `linear-gradient(to right, hsl(${guess.h}, 0%, ${guess.l}%), hsl(${guess.h}, 100%, ${guess.l}%))` }}
									/>
								</div>
								<div className="cg-slider-row">
									<label className="cg-label">Hue <span>{guess.h}°</span></label>
									<input
										type="range"
										className="cg-slider cg-hue-slider"
										min="0"
										max="359"
										value={guess.h}
										onChange={(e) => setGuess((prev) => ({ ...prev, h: Number(e.target.value) }))}
									/>
								</div>
							</div>
						</div>
						<button className="primary-btn" type="button" onClick={handleSubmitGuess}>
							Submit guess
						</button>
					</>
				)}

				{phase === "result" && (
					<>
						<p className="eyebrow">Round {round} of {COLOR_GAME_ROUNDS}</p>
						<h2 className="cg-title">
							{lastScore >= 90 ? "Excellent!" : lastScore >= 70 ? "Nice!" : lastScore >= 50 ? "Not bad" : "Keep practicing"}
						</h2>
						<div className="cg-result-swatches">
							<div className="cg-result-col">
								<div className="cg-swatch cg-swatch-sm" style={{ background: hslStr(guess) }} />
								<p className="cg-swatch-label">Your guess</p>
							</div>
							<div className="cg-result-sep">vs</div>
							<div className="cg-result-col">
								<div className="cg-swatch cg-swatch-sm" style={{ background: hslStr(target) }} />
								<p className="cg-swatch-label">Target</p>
							</div>
						</div>
						<p className="lab-hint" style={{ margin: "0.75rem 0" }}>
							Score: <strong style={{ color: scoreColor(lastScore), fontSize: "1.1rem" }}>{lastScore}%</strong>
						</p>
						<div className="lab-controls">
							<button className="primary-btn" type="button" onClick={handleNextRound}>
								{scores.length >= COLOR_GAME_ROUNDS ? "See final score" : "Next round →"}
							</button>
						</div>
					</>
				)}

				{phase === "complete" && (
					<>
						<h2 className="cg-title">Today's final score</h2>
						<p className="lab-hint" style={{ marginBottom: "1rem" }}>
							Average: <strong style={{ color: scoreColor(totalScore), fontSize: "1.5rem" }}>{totalScore}%</strong>
						</p>
						<ul className="cg-score-list">
							{scores.map((score, i) => (
								<li key={i} className="cg-score-row">
									<span>Round {i + 1}</span>
									<div className="cg-score-bar-wrap">
										<div className="cg-score-bar" style={{ width: `${score}%`, background: scoreGradient(score) }} />
									</div>
									<span style={{ color: scoreColor(score), fontWeight: 600 }}>{score}%</span>
								</li>
							))}
						</ul>
						<p className="lab-hint next-reset-hint">New colors in {resetCountdown}</p>
						<div className="lab-controls" style={{ marginTop: "1.5rem" }}>
							<a className="ghost-btn" href="/" onClick={playClick} style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
								Back to games
							</a>
						</div>
					</>
				)}
			</section>
		</PageShell>
	);
}
