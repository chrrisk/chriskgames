# play.chriskstudios.com

Small hand-built games by ChrisK Studios. New daily puzzles every night at midnight Eastern.

## The games

- **songgame**: guess the song from a half-second snippet; every wrong guess unlocks a little more audio. Two categories daily (Oldies but Goodies, 2000s & Newer), plus a Holiday category in December.
- **colorgame**: five daily colors, the same for everyone. Memorize each for four seconds, then rebuild it from memory with hue/saturation/brightness sliders.
- **nextwordgame**: a daily word chain where each word pairs with the previous one ("apple pie", "pie crust"). Only first letters to go on; wrong guesses reveal more. Puzzles are scheduled in `src/react-app/games/nextwordgame-puzzles.ts`.

## Stack

- [React](https://react.dev/) + TypeScript, built with [Vite](https://vite.dev/)
- [Hono](https://hono.dev/) API running on [Cloudflare Workers](https://developers.cloudflare.com/workers/)

## Project layout

```
src/
  react-app/
    App.tsx              # route switch (/, /songgame, /colorgame)
    components/          # shared UI (PageShell)
    pages/               # landing page
    games/               # one module per game
    styles/              # one stylesheet per area; tokens live in index.css
    lib/                 # small shared hooks/utils
  worker/                # Hono API (music search, daily tracks, archive)
scripts/                 # track validation/repair utilities
```

## Development

```bash
npm install
npm run dev        # local dev server at http://localhost:5173
npm run build      # typecheck + production build
npm run deploy     # build + deploy to Cloudflare Workers
npm run validate-tracks
```
