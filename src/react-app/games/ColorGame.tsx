import { useEffect, useRef, useState } from "react";
import { PageShell } from "../components/PageShell";
import { useClickSound } from "../lib/sound";
import "../styles/colorgame.css";

const COLOR_GAME_ROUNDS = 5;
const MEMORIZE_SECONDS = 4;

type ColorHSL = { h: number; s: number; l: number };
type ColorPhase = "memorize" | "guess" | "result" | "complete";

export function ColorGame() {
	const playClick = useClickSound();
	const [round, setRound] = useState(1);
	const [phase, setPhase] = useState<ColorPhase>("memorize");
	const [target, setTarget] = useState<ColorHSL>(() => randomColorHSL());
	const [guess, setGuess] = useState<ColorHSL>({ h: 180, s: 50, l: 50 });
	const [timeLeft, setTimeLeft] = useState(MEMORIZE_SECONDS);
	const [roundScores, setRoundScores] = useState<number[]>([]);
	const [lastScore, setLastScore] = useState(0);
	const cgTimerRef = useRef<number | null>(null);

	useEffect(() => {
		if (phase !== "memorize") return;
		cgTimerRef.current = window.setInterval(() => {
			setTimeLeft((prev) => {
				if (prev <= 1) {
					if (cgTimerRef.current) window.clearInterval(cgTimerRef.current);
					setPhase("guess");
					return 0;
				}
				return prev - 1;
			});
		}, 1000);
		return () => {
			if (cgTimerRef.current) window.clearInterval(cgTimerRef.current);
		};
	}, [phase, round]);

	const handleSubmitGuess = () => {
		playClick();
		const score = scoreColorGuess(target, guess);
		setLastScore(score);
		setRoundScores((prev) => [...prev, score]);
		setPhase("result");
	};

	const handleNextRound = () => {
		playClick();
		if (round >= COLOR_GAME_ROUNDS) {
			setPhase("complete");
		} else {
			setRound((r) => r + 1);
			setTarget(randomColorHSL());
			setGuess({ h: 180, s: 50, l: 50 });
			setTimeLeft(MEMORIZE_SECONDS);
			setPhase("memorize");
		}
	};

	const handleRestartGame = () => {
		playClick();
		setRound(1);
		setRoundScores([]);
		setLastScore(0);
		setTarget(randomColorHSL());
		setGuess({ h: 180, s: 50, l: 50 });
		setTimeLeft(MEMORIZE_SECONDS);
		setPhase("memorize");
	};

	const totalScore = roundScores.length
		? Math.round(roundScores.reduce((a, b) => a + b, 0) / roundScores.length)
		: 0;

	return (
		<PageShell
			page="colorgame"
			mainClassName="lab-doc"
			headerExtra={
				<div className="reset-countdown">
					<span>Round</span>
					<strong>{phase === "complete" ? "done" : `${round} / ${COLOR_GAME_ROUNDS}`}</strong>
				</div>
			}
		>
			<section className="doc-card cg-card">
				{phase === "memorize" && (
					<>
						<p className="eyebrow">Round {round} of {COLOR_GAME_ROUNDS}</p>
						<h2 className="cg-title">Memorize this color</h2>
						<p className="lab-hint">{timeLeft}s remaining</p>
						<div className="cg-swatch-wrap">
							<div className="cg-swatch" style={{ background: hslStr(target) }} />
							<div className="cg-timer-bar">
								<div className="cg-timer-fill" style={{ width: `${(timeLeft / MEMORIZE_SECONDS) * 100}%` }} />
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
							Score: <strong style={{ color: cgScoreColor(lastScore), fontSize: "1.1rem" }}>{lastScore}%</strong>
						</p>
						<div className="lab-controls">
							<button className="primary-btn" type="button" onClick={handleNextRound}>
								{round >= COLOR_GAME_ROUNDS ? "See final score" : "Next round →"}
							</button>
						</div>
					</>
				)}

				{phase === "complete" && (
					<>
						<h2 className="cg-title">Final score</h2>
						<p className="lab-hint" style={{ marginBottom: "1rem" }}>
							Average: <strong style={{ color: cgScoreColor(totalScore), fontSize: "1.5rem" }}>{totalScore}%</strong>
						</p>
						<ul className="cg-score-list">
							{roundScores.map((score, i) => (
								<li key={i} className="cg-score-row">
									<span>Round {i + 1}</span>
									<div className="cg-score-bar-wrap">
										<div className="cg-score-bar" style={{ width: `${score}%`, background: cgScoreGradient(score) }} />
									</div>
									<span style={{ color: cgScoreColor(score), fontWeight: 600 }}>{score}%</span>
								</li>
							))}
						</ul>
						<div className="lab-controls" style={{ marginTop: "1.5rem" }}>
							<button className="primary-btn" type="button" onClick={handleRestartGame}>
								Play again
							</button>
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

function randomColorHSL(): ColorHSL {
	return {
		h: Math.floor(Math.random() * 360),
		s: Math.floor(Math.random() * 85) + 10,
		l: Math.floor(Math.random() * 70) + 10,
	};
}

function hslStr({ h, s, l }: ColorHSL): string {
	return `hsl(${h}, ${s}%, ${l}%)`;
}

function scoreColorGuess(target: ColorHSL, guess: ColorHSL): number {
	const hueDiff = Math.min(Math.abs(target.h - guess.h), 360 - Math.abs(target.h - guess.h));
	const hueScore = 1 - hueDiff / 180;
	const satScore = 1 - Math.abs(target.s - guess.s) / 100;
	const lightScore = 1 - Math.abs(target.l - guess.l) / 100;
	const weighted = hueScore * 0.5 + satScore * 0.25 + lightScore * 0.25;
	return Math.round(Math.pow(weighted, 2) * 100);
}

function cgScoreColor(score: number): string {
	if (score >= 90) return "#85d8a6";
	if (score >= 70) return "#e7c26a";
	if (score >= 50) return "#e07b44";
	return "#ef7b6d";
}

function cgScoreGradient(score: number): string {
	if (score >= 90) return "linear-gradient(90deg, #85d8a6, #b8e6c9)";
	if (score >= 70) return "linear-gradient(90deg, #e7c26a, #85d8a6)";
	if (score >= 50) return "linear-gradient(90deg, #e07b44, #e7c26a)";
	return "linear-gradient(90deg, #ef7b6d, #e07b44)";
}
