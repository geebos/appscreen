const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const storage = require('./storage');
const auth = require('./auth');

const app = express();
const PORT = process.env.PORT || 80;

// Ensure data directories exist
const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Parse cookies
function parseCookies(req) {
    const header = req.headers.cookie;
    if (!header) return {};
    const cookies = {};
    header.split(';').forEach(c => {
        const [name, ...rest] = c.trim().split('=');
        if (name) cookies[name.trim()] = decodeURIComponent(rest.join('='));
    });
    return cookies;
}

// Cookie parser middleware
app.use((req, res, next) => {
    req.cookies = parseCookies(req);
    next();
});

// JSON body parser (must be before auth routes that read req.body)
app.use(express.json({ limit: '50mb' }));

// Auth endpoints (before auth middleware)
app.post('/api/auth/login', auth.handleLogin);
app.post('/api/auth/logout', auth.handleLogout);
app.get('/api/auth/check', auth.handleCheckAuth);

// Login page doesn't require auth
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'web', 'login.html'));
});

// Auth middleware for all other routes
app.use(auth.requireAuth);

// File upload
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

const FONT_MIME_BY_EXT = {
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

function getFontMimeType(filename, fallback) {
    const ext = path.extname(filename || '').toLowerCase();
    return FONT_MIME_BY_EXT[ext] || fallback || 'application/octet-stream';
}

function isSupportedFont(filename, mimeType) {
    const ext = path.extname(filename || '').toLowerCase();
    return Boolean(FONT_MIME_BY_EXT[ext]) || /^font\//.test(mimeType || '') || /^application\/(?:font|x-font)/.test(mimeType || '');
}

function getImageMimeType(buffer) {
    if (!buffer || buffer.length < 12) return 'application/octet-stream';
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'image/gif';
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    return 'application/octet-stream';
}

// ===== Project API =====

app.get('/api/projects', async (req, res) => {
    try {
        const projects = storage.listProjects();
        res.json(projects);
    } catch (err) {
        console.error('Error listing projects:', err);
        res.status(500).json({ error: 'Failed to list projects' });
    }
});

app.put('/api/projects/:id', async (req, res) => {
    try {
        const result = storage.saveProject(req.params.id, req.body);
        res.set('X-Server-Version', String(result._version)).json(result);
    } catch (err) {
        console.error('Error saving project:', err);
        res.status(500).json({ error: 'Failed to save project' });
    }
});

app.delete('/api/projects/:id', async (req, res) => {
    try {
        storage.deleteProject(req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting project:', err);
        res.status(500).json({ error: 'Failed to delete project' });
    }
});

app.get('/api/projects/:id', async (req, res) => {
    try {
        const data = storage.loadProject(req.params.id);
        if (!data) {
            return res.status(404).json({ error: 'Project not found' });
        }
        res.set('X-Server-Version', String(data._version || 0)).json(data);
    } catch (err) {
        console.error('Error loading project:', err);
        res.status(500).json({ error: 'Failed to load project' });
    }
});

// ===== Image API =====

app.post('/api/images/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const result = storage.saveImage(req.file.buffer, req.file.originalname);
        res.json({ id: result.id, url: `/api/images/${result.id}` });
    } catch (err) {
        console.error('Error uploading image:', err);
        res.status(500).json({ error: 'Failed to upload image' });
    }
});

app.get('/api/images/:id', async (req, res) => {
    try {
        const buf = storage.loadImage(req.params.id);
        if (!buf) {
            return res.status(404).json({ error: 'Image not found' });
        }
        res
            .set('Cache-Control', 'public, max-age=31536000')
            .set('Content-Type', getImageMimeType(buf))
            .send(buf);
    } catch (err) {
        console.error('Error loading image:', err);
        res.status(500).json({ error: 'Failed to load image' });
    }
});

app.delete('/api/images/:id', async (req, res) => {
    try {
        storage.deleteImage(req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting image:', err);
        res.status(500).json({ error: 'Failed to delete image' });
    }
});

// ===== Font API =====

app.post('/api/fonts/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        if (!isSupportedFont(req.file.originalname, req.file.mimetype)) {
            return res.status(400).json({ error: 'Unsupported font file' });
        }

        const mimeType = getFontMimeType(req.file.originalname, req.file.mimetype);
        const result = storage.saveFont(req.file.buffer, req.file.originalname, mimeType, req.body?.name);
        res.json({
            id: result.id,
            url: `/api/fonts/${result.id}`,
            name: result.name,
            fileName: result.originalName,
            type: result.mimeType,
            size: result.size
        });
    } catch (err) {
        console.error('Error uploading font:', err);
        res.status(500).json({ error: 'Failed to upload font' });
    }
});

app.get('/api/fonts', async (req, res) => {
    try {
        const fonts = storage.listFonts().map(font => ({
            id: font.id,
            url: `/api/fonts/${font.id}`,
            name: font.name,
            fileName: font.originalName,
            type: font.mimeType,
            size: font.size
        }));
        res.json(fonts);
    } catch (err) {
        console.error('Error listing fonts:', err);
        res.status(500).json({ error: 'Failed to list fonts' });
    }
});

app.get('/api/fonts/:id', async (req, res) => {
    try {
        const font = storage.loadFont(req.params.id);
        if (!font) {
            return res.status(404).json({ error: 'Font not found' });
        }

        res
            .set('Cache-Control', 'public, max-age=31536000, immutable')
            .set('Content-Type', getFontMimeType(font.metadata.originalName, font.metadata.mimeType))
            .send(font.buffer);
    } catch (err) {
        console.error('Error loading font:', err);
        res.status(500).json({ error: 'Failed to load font' });
    }
});

app.delete('/api/fonts/:id', async (req, res) => {
    try {
        storage.deleteFont(req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting font:', err);
        res.status(500).json({ error: 'Failed to delete font' });
    }
});

// ===== Static files (after API routes) =====

app.use(express.static(path.join(__dirname, '..', 'web'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.glb')) {
            res.set('Cache-Control', 'public, max-age=31536000');
        } else if (filePath.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
            res.set('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }
}));

app.use('/models', express.static(path.join(__dirname, '..', 'web', 'models')));

// ===== Health check =====

app.get('/health', (req, res) => {
    res.set('Content-Type', 'text/plain');
    res.send('healthy\n');
});

// ===== SPA fallback =====

app.get('*', (req, res) => {
    // Don't fallback on API routes
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(__dirname, '..', 'web', 'index.html'));
});

// ===== Start server =====

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Auth: ${auth.isAuthEnabled() ? 'enabled' : 'disabled'} (set AUTH_USERNAME and AUTH_PASSWORD env vars to enable)`);
});
