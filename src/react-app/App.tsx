import { useEffect } from "react";
import { Home } from "./pages/Home";
import { SongGame } from "./games/SongGame";
import { ColorGame } from "./games/ColorGame";
import { NextWordGame } from "./games/NextWordGame";
import "./styles/layout.css";

const defaultFavicon =
	"data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20viewBox%3D%270%200%20100%20100%27%3E%3Ctext%20y%3D%27.9em%27%20font-size%3D%2790%27%3E%F0%9F%8E%AE%3C/text%3E%3C/svg%3E";
const songFavicon =
	"data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20viewBox%3D%270%200%20100%20100%27%3E%3Ctext%20y%3D%27.9em%27%20font-size%3D%2790%27%3E%F0%9F%8E%B5%3C/text%3E%3C/svg%3E";

const MAINTENANCE_MODE = false;

function App() {
	const path =
		typeof window !== "undefined" ? window.location.pathname.replace(/\/$/, "") : "";
	const isSongRoute = path === "/songgame";
	const isColorRoute = path === "/colorgame";
	const isNextWordRoute = path === "/nextwordgame";

	useEffect(() => {
		if (typeof document === "undefined") return;
		const href = isSongRoute ? songFavicon : defaultFavicon;
		let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
		if (!link) {
			link = document.createElement("link");
			link.rel = "icon";
			link.type = "image/svg+xml";
			document.head.appendChild(link);
		}
		link.href = href;
	}, [isSongRoute]);

	if (MAINTENANCE_MODE) {
		return (
			<div className="maintenance">
				<div style={{ maxWidth: 640, width: "100%" }}>
					<p className="eyebrow">play.chriskstudios</p>
					<h1>Down for maintenance</h1>
					<p>We are polishing the games and will be back soon. Thanks for your patience.</p>
				</div>
			</div>
		);
	}

	if (isSongRoute) return <SongGame />;
	if (isColorRoute) return <ColorGame />;
	if (isNextWordRoute) return <NextWordGame />;
	return <Home />;
}

export default App;
