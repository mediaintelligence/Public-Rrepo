# Boss Agent Chrome Extension

A Chrome extension for accessing the MIZ OKI Boss Agent directly from your browser. Get AI-powered financial models and marketing intelligence at your fingertips.

## Features

- **Chat Interface**: Interact with Boss Agent through popup or side panel
- **Financial Tools**: Quick access to LTV prediction, ROAS optimization, CATE estimation, and more
- **Context Menu Integration**: Right-click to analyze selected text
- **Streaming Responses**: Real-time AI responses with SSE streaming
- **Financial Metrics Detection**: Highlight financial metrics on any webpage

## Installation

### Step 1: Download the Extension

Clone or download this repository to your local machine.

### Step 2: Load in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `chrome-boss-agent-extension` folder

### Step 3: Configure Connection

1. Click the Boss Agent icon in your toolbar
2. Go to **Settings** (gear icon)
3. Enter your Boss Agent API URL (default: `https://boss-agent-adk-698171499447.us-central1.run.app`)
4. (Optional) Enter your API key if authentication is required
5. Click **Test Connection** to verify

## Usage

### Popup Interface

Click the Boss Agent icon in your Chrome toolbar to open the popup with three tabs:

- **Chat**: Send messages to Boss Agent
- **Financial Tools**: Browse and invoke financial modeling tools
- **Quick Actions**: One-click access to common tasks like LTV prediction, ROAS optimization

### Side Panel

Click the side panel icon (in footer) or use `Ctrl+Shift+B` to open the full side panel interface for extended conversations.

### Context Menu

Right-click on any webpage to access:

- **Ask Boss Agent about selection**: Analyze selected text
- **Financial Tools submenu**: Quick access to LTV, ROAS, CATE, Uplift tools

### Keyboard Shortcuts

- `Ctrl+Shift+B` (or `Cmd+Shift+B` on Mac): Open Boss Agent side panel

## Available Financial Tools

| Category | Tools |
|----------|-------|
| **Value-Based Bidding** | Predict LTV, Optimize ROAS, Process Conversion |
| **ROI & CATE** | Estimate CATE, Budget Allocation, Validate Policy |
| **Uplift Modeling** | Export Cohort, Journey Risk, Estimate Uplift |
| **Attribution** | Stitch ID, Push Weights |

## Configuration Options

Access settings via the gear icon in the popup:

| Setting | Description |
|---------|-------------|
| API URL | Boss Agent service endpoint |
| API Key | Optional authentication key |
| Notifications | Enable/disable desktop notifications |
| Context Menu | Show/hide Boss Agent in right-click menu |
| Auto-open Side Panel | Automatically open side panel on click |
| Default Orchestration | Choose auto/direct/MOA/MOE mode |
| Default Lookback | Lookback period for financial analysis |
| Default LTV Model | Preferred LTV prediction model |

## File Structure

```
chrome-boss-agent-extension/
├── manifest.json          # Extension manifest (Manifest V3)
├── icons/                 # Extension icons
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── src/
│   ├── background.js      # Service worker (API client, context menus)
│   ├── popup.html         # Main popup interface
│   ├── popup.css          # Popup styles
│   ├── popup.js           # Popup functionality
│   ├── sidepanel.html     # Side panel interface
│   ├── sidepanel.css      # Side panel styles
│   ├── sidepanel.js       # Side panel functionality
│   ├── options.html       # Settings page
│   ├── options.js         # Settings functionality
│   └── content.js         # Content script for page interaction
└── README.md
```

## API Requirements

This extension requires a running Boss Agent service with the following endpoints:

- `GET /health` - Health check
- `POST /api/v1/chat` - Chat endpoint
- `GET /api/v1/chat/stream` - SSE streaming endpoint
- `GET /api/v1/mcp/tools` - List available tools
- `POST /api/v1/mcp/invoke` - Invoke a tool

## Permissions

The extension requests the following permissions:

- `storage`: Save settings and conversation state
- `activeTab`: Access current tab for context menu actions
- `sidePanel`: Enable side panel functionality
- `contextMenus`: Add right-click menu items
- `notifications`: Show desktop notifications
- `host_permissions`: Connect to Boss Agent API

## Troubleshooting

### Extension not loading

1. Ensure Developer mode is enabled in `chrome://extensions/`
2. Check for JavaScript errors in the extension's service worker console

### Connection failed

1. Verify the API URL is correct in settings
2. Check if the Boss Agent service is running
3. Ensure CORS is properly configured on the server

### Side panel not opening

1. Check if side panel permissions are granted
2. Try reopening Chrome
3. Verify the manifest includes side panel configuration

## Development

To modify the extension:

1. Make your changes to the source files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the Boss Agent extension card
4. Test your changes

## License

Part of the MIZ OKI platform. See main repository for license details.
