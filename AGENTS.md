# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

This is a **Chrome Extension** (Manifest V3) called "MIZ OKI Boss Agent" v1.0.0 — a vanilla HTML/CSS/JavaScript project with **no build system, no package manager, and no dependencies to install**. The extension is loaded directly into Chrome as an unpacked extension from the repository root (`/workspace`).

The extension has two functional modules:

1. **Boss Agent** — AI-powered chat, financial modeling tools (LTV prediction, ROAS optimization, CATE estimation, uplift modeling, attribution), and streaming SSE responses.
2. **CRE Underwriting Engine** — Commercial real estate analysis with lease validation, Monte Carlo market simulation (Ornstein-Uhlenbeck mean-reversion), default simulation (t-copula), and cash flow compilation.

### Architecture

| Entry Point | Description |
|---|---|
| `manifest.json` | Extension manifest (Manifest V3) |
| `src/background.js` | Main service worker; imports `src/cre_background/service-worker.js` |
| `src/popup.html` | Main popup with 4 tabs: Chat, Financial Tools, Quick Actions, CRE Deals |
| `src/sidepanel.html` | Side panel for extended conversations + CRE analysis |
| `src/options.html` | Settings page (API URL, API key, preferences) |
| `src/content.js` | Content script for financial metric highlighting on web pages |
| `src/cre_popup/popup.html` | CRE underwriting popup (embedded as iframe in main popup CRE tab) |
| `src/cre_sidepanel/sidepanel.html` | CRE underwriting side panel (embedded as iframe in main sidepanel) |
| `src/cre_content/content.js` | CRE-specific content script for page data extraction |
| `src/shared/api-client.js` | CRE API client (`CREApiClient`) |
| `src/shared/utils.js` | CRE utility functions (`CREUtils`) |

### Running the extension

1. Launch Chrome: `google-chrome --no-first-run --disable-sync --disable-default-apps &`
2. Navigate to `chrome://extensions/`, enable **Developer Mode**, click **Load unpacked**, and select `/workspace`.
3. The extension popup is accessible via the toolbar icon; all tabs (Chat, Financial Tools, Quick Actions, CRE Deals) should render.
4. The side panel opens via `Ctrl+Shift+S` or the side panel icon in the popup footer.

### Development workflow

- After editing source files, reload the extension via the refresh icon on `chrome://extensions/`.
- There is no hot reload, no bundler, no transpiler.

### Validating changes

- **Syntax check**: `node --check src/<file>.js` for each JS file (no ESLint configured).
- **HTML check**: All 5 HTML files can be parsed without errors.
- **No automated tests**: There is no test framework, no test files, and no CI/CD.
- **Manual testing**: Load the extension in Chrome and interact with the UI.

### Key caveats

- **Remote API dependency.** All features call a remote backend at `https://boss-agent-adk-698171499447.us-central1.run.app`. The extension UI loads without it, but functional responses require the API. The CRE module has a separate status endpoint at `/api/v1/cre-underwriting/status`.
- **Chrome 114+ required.** The extension uses Manifest V3 APIs (`chrome.sidePanel`, `chrome.storage`, `chrome.contextMenus`, etc.).
- **No `package.json` or dependencies.** There is nothing to install. The update script is a no-op.
- **Module imports.** `background.js` uses ES module `import` from `cre_background/service-worker.js`. The CRE popup/sidepanel use `<script>` tags to load `shared/api-client.js` and `shared/utils.js`.
