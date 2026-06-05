# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VRBright is a PWA (Progressive Web App) for field workers who perform painting, cleaning, and repair work in condominiums and apartments. Workers use it to view Work Orders (WO), update status, add notes, and capture photos as proof of work. The app works offline-first with IndexedDB and syncs with a Bubble.io backend when online.

## Commands

```bash
npm run dev       # Start dev server (Vite)
npm run build     # Type-check + production build
npm run preview   # Preview production build locally
npm run lint      # ESLint
npx tsc --noEmit  # Type-check only (no emit)
```

No test framework is currently set up.

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
├── context/             # SyncContext (queue state + sync trigger)
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

### Sync queue actions

The sync queue supports four actions: `update_status`, `update_notes`, `upload_photo`, `complete_wo`. Each item has `max_attempts: 5` and exponential backoff starting at 1s. `processSyncQueue()` is triggered by `SyncContext` on every `online` event and can be called manually via `triggerSync()`. Photos are uploaded to a separate Bubble app (`vrbcrmsystem.bubbleapps.io`) via `api.uploadPhoto()` — the `codigo_id` from the work order is used as the photo key.

### Work order status mapping

Work orders fetched from Bubble map `status` field as: `IN PROGRESS` → `in_progress`, `COMPLETED` → `completed`, everything else → `pending`. The reverse mapping when writing back to Bubble is defined in `WorkOrderDetailPage.tsx` (`STATUS_OPTIONS` constant) with Bubble values `NOT STARTED`, `IN PROGRESS`, `COMPLETED`. Bubble also provides `codigo_id` (WO code), `qual_condo_txt` (address), `apt` (unit), `notes_extra` (description/notes), and `total_GERAL_WORKER` (payment value).

## API Integration

Bubble.io is the backend. Configure via env vars:
- `VITE_BUBBLE_API_URL` — base URL (default: `https://system.vrbrightpainting.com/version-test/api/1.1`)
- `VITE_BUBBLE_API_KEY` — Bearer token for the main API

Work orders: fetched from `WORKING ORDERS` Bubble object with filters: `status != COMPLETED`, `liberado_para_pintor = true`, `qual_pintor = <WORKER_ID>`. The worker ID is currently a static placeholder (`1681158121564x251998441125205630`) in `api.ts`.

Photo upload goes to a separate Bubble app (`https://vrbcrmsystem.bubbleapps.io`) with a hardcoded Bearer token (`9d461f01be8bc85cf85ae4aad0dc5a07`) in `api.ts` — not configurable via env var.

## Design

- Mobile-first, standalone PWA (portrait orientation)
- Primary color: `#7DD3C0` (turquesa)
- Tailwind CSS v4 — custom tokens are in `src/index.css` under `@theme {}`, not `tailwind.config.js` (which doesn't exist)
- No dark mode (field workers use it outdoors)

## Shell notes

- Routes: `/` (work orders list), `/wo/:id` (detail), `/sync` (sync status)
- `AppShell` fetches worker name from Bubble on mount and displays online/offline indicator + pending sync count in the header
- No auth context wired up yet — worker identity is resolved from a static placeholder email (`admin@uatsbuddy.com`) via `fetchWorkerName()`
