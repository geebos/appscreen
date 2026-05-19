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

// ===== Project API =====

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
        res.set('Cache-Control', 'public, max-age=31536000').send(buf);
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
