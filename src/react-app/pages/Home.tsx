import { PageShell } from "../components/PageShell";
import { useClickSound } from "../lib/sound";
import "../styles/home.css";

const games = [
	{
		title: "songgame",
		emoji: "🎵",
		chip: "Daily",
		tagline: "Guess the song from a half-second snippet. Every wrong guess buys you a little more audio.",
		path: "/songgame",
	},
	{
		title: "colorgame",
		emoji: "🎨",
		chip: "Daily",
		tagline: "Five colors a day, same for everyone. Stare for four seconds, then rebuild each from memory.",
		path: "/colorgame",
	},
];

export function Home() {
	const playClick = useClickSound();
	return (
		<PageShell>
			<section className="hero">
				<p className="eyebrow">play.chriskstudios.com</p>
				<h1>
					Small games,
					<br />
					<em>played daily.</em>
				</h1>
				<p className="hero-sub">
					A hand-built collection of quick puzzles. New challenges drop every
					night at midnight Eastern. No accounts, no ads, no fuss.
				</p>
				<div className="hero-actions">
					<a className="primary-btn" href="/songgame" onClick={playClick}>
						Play today's songgame
					</a>
					<a className="ghost-btn" href="/colorgame" onClick={playClick}>
						Try colorgame
					</a>
				</div>
			</section>
			<section className="games-section" id="games">
				<div className="section-head">
					<h2>The games</h2>
					<p>Two so far. More on the workbench.</p>
				</div>
				<div className="games-grid">
					{games.map((game) => (
						<a className="game-card" key={game.title} href={game.path} onClick={playClick}>
							<div className="game-card-top">
								<span className="game-emoji" aria-hidden="true">
									{game.emoji}
								</span>
								<span className="game-chip">{game.chip}</span>
							</div>
							<h3>{game.title}</h3>
							<p>{game.tagline}</p>
							<span className="game-cta">
								Play now<span className="game-cta-arrow" aria-hidden="true"> →</span>
							</span>
						</a>
					))}
					<div className="game-card coming-soon">
						<div className="game-card-top">
							<span className="game-emoji" aria-hidden="true">
								🛠️
							</span>
							<span className="game-chip">Soon</span>
						</div>
						<h3>something new</h3>
						<p>The next game is in the works. Check back soon.</p>
					</div>
				</div>
			</section>
		</PageShell>
	);
}
