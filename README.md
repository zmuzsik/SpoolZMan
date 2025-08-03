# Spoolman Usage App

This app lets you select a filament spool from Spoolman, enter grams used, and register usage with optional flow compensation. Usage is stored in a local SQLite database and Spoolman is updated with the remaining weight. The app provides two main views: remaining filament tracking and complete print history.

## Features

- **Usage Registration**: Select spools, enter weight used, and add optional notes
- **Flow Compensation**: Configurable automatic compensation for flow variations (default +1.5g)
- **Remaining Filament View**: Interactive table showing all spools with remaining weights
- **Print History View**: Complete usage history with dates, weights, costs, and notes
- **Individual Spool Details**: Click any spool to view its detailed usage history
- **Cost Calculation**: Automatic cost calculation based on filament price and usage
- **Connection Status**: Real-time Spoolman connection monitoring
- **Archived Spools**: Includes archived spools in usage history for complete tracking

## How to run

### Backend
1. Open a terminal in `backend`.
2. Run:
   ```powershell
   npm install
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

### Spoolman URL
- Set your Spoolman instance URL from the settings panel (e.g., `http://192.168.0.15:7912`)
- The app automatically appends `/api/v1` to your base URL

### Flow Compensation
- Configure automatic weight compensation for flow variations
- Default: +1.5g added to actual usage
- Adjustable from 0-20g in 0.1g increments
- Can be toggled on/off per usage entry

## Usage Views

### Remaining Filament
- Shows all spools with remaining weights
- Color-coded indicators for easy identification
- Click any spool to view its individual usage history
- Real-time updates after registering new usage

### Print History
- Complete chronological usage history across all spools
- Shows date, filament details, weight used, calculated cost, and notes
- Includes both active and archived spools
- Sortable by date (newest first)

## Requirements
- Node.js
- Local Spoolman instance running and accessible
- Spoolman spools should have price information for cost calculations

## Data Storage
- Usage history: `backend/usage.db` (SQLite)
- Configuration settings: Stored in same SQLite database
- Spoolman integration: Updates remaining weight and last_used timestamps

## API Integration
- Connects to Spoolman API v1
- Fetches spool data including filament details, vendors, and pricing
- Updates spool remaining weight after each usage registration
- Includes archived spools in usage history queries

## No authentication required.