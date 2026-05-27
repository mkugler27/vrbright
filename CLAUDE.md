# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VRBright is a PWA (Progressive Web App) for field workers who perform painting, cleaning, and repair work in condominiums and apartments. Workers use it to view Work Orders (WO), update status, add notes, and capture photos as proof of work. The app works offline-first with IndexedDB and syncs with a Bubble.io backend when online.

## Commands

```bash
npm run dev       # Start dev server (Vite)
npm run build     # Type-check + production build
npm run preview   # Preview production build locally
npx tsc --noEmit  # Type-check only (no emit)
```

## Architecture

- **Vite + React + TypeScript** with Tailwind CSS v4 (via `@tailwindcss/vite` plugin)
- **PWA**: `vite-plugin-pwa` with Workbox (auto-update, precache, runtime cache for Bubble API)
- **Offline storage**: IndexedDB via `idb` library — stores: `workOrders`, `photos`, `syncQueue`
- **Sync engine**: Queue-based (FIFO) with exponential backoff retry. Auto-triggers on `online` event.
- **Image compression**: `browser-image-compression` — max 500KB, quality 70%, max 1920px dimension

### Key directories

```
src/
├── components/layout/   # AppShell (header + bottom nav + outlet)
├── components/ui/       # Button, StatusBadge
├── context/             # AuthContext (token in localStorage), SyncContext (queue state)
├── hooks/               # useOnlineStatus, useWorkOrders
├── pages/               # LoginPage, WorkOrdersPage, WorkOrderDetailPage, SyncStatusPage
├── services/            # api.ts (Bubble HTTP client), db.ts (IndexedDB), sync.ts (queue processor), imageCompressor.ts
└── types/               # WorkOrder, Photo, SyncQueueItem, User interfaces
```

### Data flow

1. Online: fetch WOs from Bubble API → save to IndexedDB → render from IndexedDB
2. User actions (status change, notes, photos) → save locally + enqueue in `syncQueue`
3. When online: process queue FIFO → on success remove item, on failure retry with backoff
4. Photos are compressed client-side before storing in IndexedDB

## API Integration

The app communicates with Bubble.io. The base URL is configured via `VITE_BUBBLE_API_URL` env var. See `.env.example`. Endpoints are in `src/services/api.ts` — currently placeholder paths (`/wf/login`, `/wf/get_work_orders`, etc.) to be replaced with actual Bubble workflow URLs.

## Design

- Mobile-first, standalone PWA (portrait orientation)
- Primary color: `#7DD3C0` (turquesa)
- Tailwind CSS v4 with custom theme tokens defined in `src/index.css`
- No dark mode (field workers use it outdoors)
