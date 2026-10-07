# Hyperliquid Trade Exporter

Standalone HTML/CSS/JS tool for fetching Hyperliquid public trade fills and exporting them.

## Features
- Public wallet address only; no private key or seed phrase.
- Hyperliquid `POST https://api.hyperliquid.xyz/info` + `userFillsByTime`.
- Start/end date filtering.
- 7-day request windows and pagination.
- De-duplicates returned fills.
- Table of date/time, coin, direction, side, price, size, notional, closed P&L, fee, fee token, order ID, trade ID and hash.
- Summary: fills, closed P&L, fees, net P&L (closed P&L - fees), volume and symbols.
- CSV and raw JSON download.

## Run
Open `index.html` in Chrome/Edge. If local-file CORS is blocked, serve the folder with `python -m http.server 8000` and open `http://localhost:8000`.

## API limitation
Hyperliquid documents a maximum of 2,000 fills per `userFillsByTime` response and says only the 10,000 most recent fills are available through that endpoint. The exporter warns when it hits the pagination ceiling.
