import type { ReactNode } from "react";
import playLogo from "../assets/play-logo.png";
import { useClickSound } from "../lib/sound";
import "../styles/layout.css";

type PageShellProps = {
	page?: string;
	headerExtra?: ReactNode;
	mainClassName?: string;
	children: ReactNode;
};

export function PageShell({ page = "play", headerExtra, mainClassName, children }: PageShellProps) {
	const playClick = useClickSound();
	return (
		<div className="play-shell">
			<header className="play-header">
				<a className="brand" href="/" onClick={playClick}>
					<img src={playLogo} alt="ChrisK Studios logo" />
					<div>
						<p className="brand-label">ChrisK Studios</p>
						<p className="brand-page">{page}</p>
					</div>
				</a>
				{headerExtra ? <div className="header-actions">{headerExtra}</div> : null}
			</header>
			<main className={mainClassName ? `doc ${mainClassName}` : "doc"}>{children}</main>
			<footer className="play-footer">
				<nav>
					<a href="/" onClick={playClick}>home</a>
					<a href="/songgame" onClick={playClick}>songgame</a>
					<a href="/colorgame" onClick={playClick}>colorgame</a>
					<a href="/chaingame" onClick={playClick}>chaingame</a>
				</nav>
				<p>© ChrisK Studios 2026</p>
			</footer>
		</div>
	);
}
