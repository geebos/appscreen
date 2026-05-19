# App Store Screenshot Generator

A free, open-source tool for creating beautiful App Store screenshots with customizable backgrounds, text overlays, and 3D device mockups.

**[Start using it now. Hosted on GitHub Pages](https://yuzu-hub.github.io/appscreen/)**

![App Store Screenshot Generator](src/web/img/screenshot-generator.png)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> Built by [YuzuHub](https://yuzuhub.com) — We build smart AI products in Dusseldorf, Germany. Check out [yuzu.chat](https://yuzu.chat), [Eno](https://eno.yuzuhub.com), [VoltPlan](https://voltplan.app) and more.

## Features

### Output & Export
- **Multiple Output Sizes**: iPhone 6.9", 6.7", 6.5", 5.5" and iPad 12.9", 11" App Store requirements, plus custom sizes
- **Batch Export**: Export all screenshots at once as a ZIP file
- **Per-Screenshot Settings**: Each screenshot can have its own background, device settings, and text

### Backgrounds
- **Gradient Backgrounds**: Multi-stop gradients with draggable color stops and angle control
- **Preset Gradients**: Quick-access gradient presets for common styles
- **Solid Color**: Simple single-color backgrounds
- **Image Backgrounds**: Upload custom images with blur, overlay, and fit options
- **Noise Overlay**: Add subtle noise texture to any background

### Device Mockups
- **2D Mode**: Position, scale, rotate, and adjust corner radius of screenshots
- **3D Mode**: Interactive iPhone 15 Pro Max and Samsung Galaxy S25 Ultra 3D mockup with drag-to-rotate
- **Position Presets**: Centered, bleed, tilt left/right, perspective, and more
- **Shadow Effects**: Customizable drop shadows with color, blur, opacity, and offset
- **Border Effects**: Add borders around screenshots with adjustable width and opacity

### Text Overlays
- **Headlines & Subheadlines**: Separate controls with enable/disable toggles
- **Font Picker**: Access to 1500+ Google Fonts with search and preview
- **Text Styling**: Font weight, italic, underline, strikethrough options
- **Positioning**: Top or bottom placement with offset control
- **Line Height**: Adjustable spacing for multi-line text

### Multi-Language Support
- **Multiple Languages**: Add translations for any language
- **Language Flags**: Visual language switcher with flag icons
- **AI-Powered Translation**: Auto-translate using Claude, OpenAI, or Google AI
- **Per-Screenshot Languages**: Different text per screenshot if needed
- **Localized Screenshots**: Upload language-specific screenshot images with auto-detection from filename
- **Smart Duplicate Detection**: Dialog to replace, create new, or skip when uploading matching screenshots
- **Multi-Language Export**: Export current language only or all languages in separate folders

### Project Management
- **Multiple Projects**: Create, rename, delete, and duplicate projects
- **Auto-Save**: Local IndexedDB + background server sync via Web Worker
- **Export/Import**: Backup and restore projects as JSON files
- **Screenshot Count**: See screenshot counts in project selector

### Server & Sync
- **Backend API**: Express.js server with REST API for projects and images
- **Image Storage**: MD5-based deduplication, relative path URLs
- **Background Sync**: Web Worker pushes projects to server in background, never blocks UI
- **Optional Auth**: Password-protect your instance via environment variables

### User Interface
- **Dark/Light/Auto Theme**: Adapts to system preference or manual toggle
- **Side Preview Carousel**: See adjacent screenshots while editing
- **Drag & Drop**: Reorder screenshots and elements by dragging
- **Collapsible Sections**: Clean UI with expandable settings panels
- **Elements System**: Add graphics, text, emoji, and icons as overlay layers

## Getting Started

### Just Want to Use It?

Visit **[yuzu-hub.github.io/appscreen](https://yuzu-hub.github.io/appscreen/)** to use the tool directly in your browser. No installation needed!

---

### Self-Hosted (Docker)

```bash
# Pull and run
docker run -d -p 8080:80 ghcr.io/yuzu-hub/appscreen:latest

# With auth
docker run -d -p 8080:80 \
  -e AUTH_USERNAME=admin \
  -e AUTH_PASSWORD=mypassword \
  -v ./data:/app/data \
  ghcr.io/yuzu-hub/appscreen:latest

# Or with Docker Compose
echo "AUTH_USERNAME=admin" > .env
echo "AUTH_PASSWORD=mypassword" >> .env
docker compose up -d
```

Then open `http://localhost:8080`.

### Development Setup

```bash
# Install dependencies
npm install

# Start dev server (with auto-reload)
npm run dev

# Or production
npm start

# With auth
AUTH_USERNAME=admin AUTH_PASSWORD=mypassword npm start
```

The server starts on port 80 by default (set `PORT` env var to change).

### Project Structure

```
src/
├── web/                # Frontend (browser)
│   ├── index.html      # Main application
│   ├── login.html      # Auth login page
│   ├── app.js          # Core application logic
│   ├── styles.css      # Styling
│   ├── api-client.js   # Server API client
│   ├── sync-worker.js  # Background sync worker
│   ├── img/            # Icons and assets
│   └── models/         # 3D device models
│
└── server/             # Backend (Node.js/Express)
    ├── server.js       # Express server
    ├── storage.js      # JSON file storage
    └── auth.js         # Auth with session management

data/                   # Runtime data (git-ignored)
├── projects/           # Project snapshots (keeps last 10)
├── images/             # Uploaded images (MD5-named)
└── sessions.json       # Auth sessions
```

### Just Frontend

For frontend-only development without the backend:

```bash
cd src/web
python3 -m http.server 8000
```

## Usage

1. **Upload Screenshots**: Drag and drop your app screenshots or click to browse
2. **Choose Output Size**: Select the target device size from the sidebar
3. **Customize Background**: Choose gradient, solid color, or image background
4. **Position Screenshot**: Use presets or manually adjust scale, position, and rotation
5. **Switch to 3D** (optional): Enable 3D mode for interactive device mockup
6. **Add Text**: Enter your headline and optional subheadline
7. **Export**: Download the current screenshot or export all at once as ZIP

## AI Translation

To use the AI-powered translation feature:

1. Click the Settings icon (gear) in the sidebar
2. Choose your AI provider (Claude, OpenAI, or Google)
3. Enter your API key from the respective provider's console
4. Add multiple languages to your headline/subheadline
5. Click the translate icon and use "Auto-translate with AI"

Your API key is stored locally in your browser and only sent to the respective AI provider's API.

## Tech Stack

- Vanilla JavaScript (no frameworks) for frontend
- HTML5 Canvas for 2D rendering
- Three.js for 3D device mockups
- IndexedDB for local storage
- Web Worker for background server sync
- Express.js for backend REST API
- JSON file storage (no database required)
- JSZip for batch export
- Google Fonts API for font picker
- Claude/OpenAI/Google APIs for translations
- Docker for containerized deployment

## Apps Using This Project

Built something with this tool? Add your app to the list by submitting a pull request!

| App | Description | Link |
|-----|-------------|------|
| Cable | Manage your 12V systems like Boats and RVs | [cable.yuzuhub.com](https://cable.yuzuhub.com) |
| Eno | Wine pairings and food pairings made easy | [eno.yuzuhub.com](https://eno.yuzuhub.com) |
| TravelRates Currency Converter* | Exchange Rates for Travelers | [apple.com](https://apps.apple.com/sg/app/travelrates-currency-converter/id6756080378) |
| Trakz Sales Tracker | Manage sales for restaurants and small businesses | [apple.com](https://apps.apple.com/us/app/trakz-sales-tracker/id6748954468) |
| AI Soccer Insights Football IQ | AI-powered football predictions and insights | [apple.com](https://apps.apple.com/us/app/ai-soccer-insights-football-iq/id6592649804) |
| Navegatime | time tracking for workers and business functions | [play.google.com](https://play.google.com/store/apps/details?id=com.companyname.NavegaTime) |
| Sommo | Your personal wine journey - scan labels, learn wine, and build your tasting journal | [sommo.app](https://sommo.app) |
| Dandelion: Write and Let Go | An ephemeral journal for writing to let go, not save. | [apple.com](https://apps.apple.com/us/app/dandelion-write-and-let-go/id6757363901) |
| *Your app here* | *Submit a PR to add your app* | *Your app link* |

## License

MIT License - feel free to use, modify, and distribute.

## Credits
- **Samsung Galaxy S25 Ultra 3D Model** by [mistJS](https://sketchfab.com/mistjs) - Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- **iPhone 15 Pro Max 3D Model** by [MajdyModels](https://sketchfab.com/majdymodels) - Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

## Author

Proudly vibe coded by [Stefan](https://github.com/BlackMac) at [YuzuHub](https://yuzuhub.com/en) — building smart AI products from Dusseldorf, Germany.
