# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

This is a **Chrome Extension** (Manifest V3) called "MIZ OKI Boss Agent" — a vanilla HTML/CSS/JavaScript project with **no build system, no package manager, and no dependencies to install**. The extension is loaded directly into Chrome as an unpacked extension from the repository root (`/workspace`).

### Running the extension

1. Launch Chrome: `google-chrome --no-first-run --disable-sync --disable-default-apps &`
2. Navigate to `chrome://extensions/`, enable Developer Mode, click "Load unpacked", and select `/workspace`.
3. The extension popup is accessible via the toolbar icon; all tabs (Chat, Financial Tools, Quick Actions, CRE Deals) should render.

### Key caveats

- **No lint/test/build commands exist.** There is no `package.json`, no ESLint, no test framework, and no bundler. Syntax validation can be done with `node --check <file>` on each `.js` file.
- **Remote API dependency.** All features (chat, financial tools, CRE underwriting) call a remote backend at `https://boss-agent-adk-698171499447.us-central1.run.app`. The extension will load and render the UI without it, but functional responses require the API to be reachable and correctly configured.
- **No hot reload.** After editing source files, reload the extension via the refresh icon on `chrome://extensions/` or by reloading the unpacked extension.
- **Chrome required.** The extension uses Manifest V3 APIs (`chrome.sidePanel`, `chrome.storage`, etc.) and must be tested in Google Chrome 114+.

### File structure

See `README.md` for the full file structure. Key entry points: `manifest.json` (extension manifest), `src/background.js` (service worker), `src/popup.html` (main popup UI).
