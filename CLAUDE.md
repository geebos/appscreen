# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

App Store Screenshot Generator - a browser-based tool for creating App Store marketing screenshots. **Frontend** built with vanilla JavaScript, HTML5 Canvas, Three.js, and CSS. **Backend** built with Express.js for REST API, auth, and static file serving. No frontend build process required.

## Agent Instructions

**Development Server:**
- The agent should automatically start the local development server when needed using `npm start` (or `npm run dev` for watch mode)
- The agent should run the server in the background and inform the user which URL to open (e.g., `http://localhost:8000`)
- The agent should NOT ask the user to start the server manually
- The agent should monitor server logs to detect and report any errors or problems to the user
- For frontend-only development without the backend, use `python3 -m http.server 8000` from `src/web/`

**Git & Commits:**
- The agent should handle all git operations automatically (add, commit, push)
- Before creating a commit, the agent MUST show the proposed commit message to the user and wait for approval
- Only after user approval should the agent proceed with the commit
- The agent should follow standard git commit message conventions

## Development

To run the full application:

```bash
npm install        # Install dependencies (Express, multer)
npm start          # Start Express server on port 80 (or PORT env var)
npm run dev        # Start with --watch for auto-reload

# With auth enabled:
AUTH_USERNAME=admin AUTH_PASSWORD=mypassword npm start
```

Without auth (default), all routes pass through. With auth enabled, API routes return 401 and page routes redirect to `/login.html`.

Open `http://localhost:8000` (or the PORT you set) in browser.

## Project Structure

```
src/
├── web/                          # Frontend (browser)
│   ├── index.html                # Main UI with modals and upload overlay
│   ├── login.html                # Login page (shown when auth is required)
│   ├── app.js                    # Main application logic (~8700 lines)
│   ├── styles.css                # Dark theme, responsive CSS Grid layout
│   ├── three-renderer.js         # Three.js 3D rendering for device mockups
│   ├── language-utils.js         # Language detection, localized images, translation dialogs
│   ├── magical-titles.js         # AI-generated marketing headlines
│   ├── llm.js                    # AI provider integration (Claude, OpenAI, Google)
│   ├── lucide-icons.js           # Lucide icon picker data
│   ├── api-client.js             # Remote API client (save/delete projects, upload/delete images)
│   ├── img/                      # Icons and asset images
│   └── models/                   # 3D device models (GLB format)
│
└── server/                       # Backend (Node.js / Express)
    ├── server.js                 # Express server: static proxy + REST API + auth
    ├── storage.js                # JSON file storage with versioned snapshots
    └── auth.js                   # Cookie-based auth with multiple session support
```

## Architecture

**Backend (`src/server/`):**

- `server.js` — Express server serving static files from `src/web/`, plus REST API routes
- `storage.js` — JSON file storage: projects in `data/projects/<id>/<timestamp>.json` (keeps latest 10 versions), images in `data/images/<md5>` (MD5-based dedup)
- `auth.js` — Auth middleware (`requireAuth`), session management in `data/sessions.json`, environment-based credentials (`AUTH_USERNAME`/`AUTH_PASSWORD`)

**API Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects` | List projects |
| GET | `/api/projects/:id` | Load project |
| PUT | `/api/projects/:id` | Save project (upsert) |
| DELETE | `/api/projects/:id` | Delete project |
| POST | `/api/images/upload` | Upload image (returns `{id, url}`) |
| GET | `/api/images/:id` | Download image |
| DELETE | `/api/images/:id` | Delete image |
| POST | `/api/auth/login` | Login (requires `{username, password}`) |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/check` | Check auth status |

**Frontend (`src/web/`):**

Key patterns in `app.js`:
- `state` object at top holds all application state (screenshots, settings, text, background config)
- `state._version` / `state._remoteVersion` — timestamp-based versioning from backend snapshots
- `updateCanvas()` is the main render function - call after any state change
- `saveState()` — serializes the current project and debounces `PUT /api/projects/:id`
- `loadState()` — loads the current project with `GET /api/projects/:id`
- `syncUIWithState()` updates all UI controls to reflect current state
- Project management uses backend project APIs as the source of truth; there is no browser database fallback
- Before project save, any remaining image data URLs are uploaded to `/api/images/upload` and replaced with relative paths

Image Upload (`uploadImageToServer()` in `app.js`):
- Called at all 5 upload entry points (screenshot, desktop import, background, element graphic, translation)
- Shows global overlay with progress animation and cancel button
- Uses AbortController for cancel support
- Falls back to dataURL on upload failure
- Background images persist via `background.imageUrl` field

Canvas rendering pipeline (in updateCanvas):
1. `drawBackground()` - gradient/solid/image with optional blur and overlay
2. `drawScreenshot()` - positioned, scaled, rotated screenshot with shadow and border
3. `drawText()` - headline and subheadline with multi-language support
4. `drawNoise()` - optional noise texture overlay

Multi-language text:
- `state.text.headlines` and `state.text.subheadlines` are objects keyed by language code
- `getTextSettings()` returns either global or per-screenshot text depending on toggle state
- AI translation calls Claude/OpenAI/Google API directly from browser (requires API key in settings)

Localized screenshots (in `language-utils.js`):
- Each screenshot has `localizedImages` object keyed by language code (e.g., `{ 'en': {...}, 'de': {...} }`)
- `detectLanguageFromFilename()` - parses suffixes like `_de`, `-fr`, `_pt-br` from filenames
- `getScreenshotImage(screenshot)` - returns image for current language with fallback chain
- `findScreenshotByBaseFilename()` - matches uploads to existing screenshots by base name
- Duplicate detection shows dialog with Replace/Create New/Skip options when uploading matching files

## Key Functions

**Project & Screenshots (`app.js`):**
- `init()` — loads project list and current state from backend APIs
- `createProject()` / `deleteProject()` / `switchProject()` / `duplicateProject()` — async project management through project APIs
- `saveState()` — writes project snapshots to `PUT /api/projects/:id` with `_version` timestamp
- `loadState()` — loads project snapshots from `GET /api/projects/:id`
- `handleFiles()` — processes uploaded images, detects language, shows duplicate dialog if needed
- `createNewScreenshot()` — creates screenshot entry with localized image support
- `exportCurrent()` / `exportAll()` — generates PNG downloads from canvas (ZIP for batch export)
- `applyPositionPreset()` — applies preset screenshot positioning (centered, bleed, tilt, perspective, etc.)

**Image Upload (`app.js`):**
- `uploadImageToServer(file)` — uploads file to `/api/images/upload`, shows overlay, supports cancel
- `showUploadOverlay()` / `hideUploadOverlay()` / `setUploadStatus()` — overlay management
- `dataURLToBlob(dataURL)` — converts base64 data URL to Blob (for desktop import)

**Language Utils (`language-utils.js`):**
- `detectLanguageFromFilename()` — extracts language code from filename suffixes
- `getBaseFilename()` — strips language suffix and extension for matching
- `findScreenshotByBaseFilename()` — finds existing screenshot with same base name
- `getScreenshotImage()` — returns localized image for current language with fallbacks
- `addLocalizedImage()` / `removeLocalizedImage()` — manage per-language images
- `showDuplicateDialog()` — async dialog for handling duplicate uploads
- `showExportLanguageDialog()` — dialog for choosing export scope (current/all languages)

**API Client (`api-client.js`):**
- `apiSaveProject(id, data)` — PUT project to server
- `apiDeleteProject(id)` — DELETE project from server
- `apiUploadImage(file, projectId)` — POST image upload
- `apiDeleteImage(id)` — DELETE image from server
- All functions handle 401 by redirecting to `/login.html`

## External Dependencies

- **Express** — backend server and REST API
- **multer** — file upload handling
- **Three.js** (r128) — 3D rendering for device mockups
- **GLTFLoader** — loads iPhone/Samsung 3D models
- **JSZip** — creates ZIP files for batch export
- **Google Fonts API** — font picker with 1500+ fonts
