# Trade Assistant

Trade Assistant is a Chrome extension for adding a compact trading assistant panel to supported brokerage web platforms.

The current version focuses on options trading workflows. Future phases can extend the same panel to stock trading and other market tools.

## Current Features

- Injects a small Shadow DOM based trading panel into supported broker pages.
- Supports Parsian and Khobregan brokerage hosts through profile-based configuration.
- Reads option symbols directly from the page favorites/watchlist DOM.
- Auto-refreshes available option symbols and option strategies.
- Auto-selects a matching strategy for selected symbols A and B when possible.
- Monitors option spread conditions for opening and offsetting positions.
- Highlights `BuyReturn` and `OffsetReturn` when the configured return condition is met.
- Supports repeated execution for opening a position:
  - Buy symbol A at `Ask(A)`.
  - Wait for buy execution check.
  - Sell symbol B at `Bid(B)`.
- Supports repeated execution for offsetting a position:
  - Buy symbol B at `Ask(B)`.
  - Wait for buy execution check.
  - Sell symbol A at `Bid(A)`.
- Provides stop buttons for interrupting repeated execution flows.

## Supported Hosts

The extension is configured for:

- `https://patris.parsianbroker.com/*`
- `https://khobregan.tsetab.ir/*`
- `https://khobregan-red.tsetab.ir/*`

API requests are routed through the active host profile in `config.js`.

## Installation For Development

1. Open Chrome and go to `chrome://extensions/`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this project folder.
5. Open one of the supported broker pages and refresh it.

If you change files, reload the extension from `chrome://extensions/` and refresh the broker page.

## Main Files

- `manifest.json`: Chrome extension manifest, permissions, content script registration, and author metadata.
- `content.js`: Loads the UI, CSS, config, and main script into the broker page.
- `config.js`: Host-specific broker API configuration.
- `ui.html`: Panel markup.
- `ui.css`: Isolated panel styling.
- `ui.js`: Trading panel behavior, monitoring, strategy selection, and order flow logic.

## Important Notes

- This project is a browser automation/helper tool and is not financial advice.
- Order execution logic depends on broker APIs and the live page DOM structure.
- The current buy-execution confirmation is intentionally a placeholder that waits for 1 second. Replace `isOptionBuyOrderExecuted` with a real order-status check before relying on execution-sensitive workflows.
- Keep local IDE files such as `.vs/` and `.vscode/` out of source control.

## Author

mohammad mohammadi
