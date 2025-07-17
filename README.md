# Spoolman Usage App

This app lets you select a filament spool from Spoolman, enter grams used, and register usage. Usage is stored in a local SQLite database and Spoolman is updated. You can also view remaining filament for each spool and configure the Spoolman API URL.

## How to run

### Backend
1. Open a terminal in `backend`.
2. Run:
   ```powershell
   node server.js
   ```

### Frontend
1. Open a terminal in `frontend`.
2. Run:
   ```powershell
   npm install
   npm run dev
   ```

## Configuration
- The Spoolman API URL can be set from the frontend UI.

## Requirements
- Node.js
- Local Spoolman instance

## Data
- Usage is stored in `backend/usage.db` (SQLite).

## No authentication required.
