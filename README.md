# Dhi.io — Focus Analytics

A Chrome extension that tracks your tab usage, detects idle time, 
and logs background audio (YouTube/Spotify) as mild passive time.

## Features
- Real-time tab time tracking
- Idle detection (pauses when you walk away)
- Background audio tracked at 0.3× weight
- Clean dark UI with donut chart

## Setup
```bash
npm install
npm run build
```
Then load the `dist/` folder in Chrome via `chrome://extensions` → Developer mode → Load unpacked.

## Tech
- React + Vite (popup UI)
- Chrome Extension Manifest V3
- No external UI dependencies — pure SVG charts