# Book Authoring Tool Lite

This is the pared-down version with Chapters, Works, and HTML Import (no newspaper editor). It will still display newspapers from older saved states by converting them to HTML snippets on load.

## Run in Browser
- Open `BookAuthor-lite.html` directly in a modern browser (Edge/Chrome recommended).

## Run as an App (Electron)
1) Install dependencies (once): `npm install`
2) Dev run: `npm run electron:start`
3) Build installer: `npm run electron:build`

## Features
- Chapters (prose with footnotes)
- Works (formatted standalone pieces)
- HTML Import (paste full HTML, strip head/scripts/meta, optional whitespace flatten)
- Paginated story preview
- Debounced live preview and state saving (localStorage)
- Newspapers from legacy states render as HTML snippets for continuity

## Files
- `BookAuthor-lite.html`, `book-app-lite.js`, `book-styles-lite.css`: UI + logic + styles
- `main.js`, `preload.js`, `package.json`: Electron entrypoint and scripts for the lite app

## License
MIT (see ../LICENSE).
