const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SESSIONS_FILE = path.join(__dirname, '..', '..', 'data', 'sessions.json');
const COOKIE_NAME = 'appscreen_session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

let sessions = {};
let authConfig = null;

function getAuthConfig() {
    if (!authConfig) {
        const username = process.env.AUTH_USERNAME;
        const password = process.env.AUTH_PASSWORD;
        if (username && password) {
            authConfig = { username, password };
        }
    }
    return authConfig;
}

function isAuthEnabled() {
    return !!getAuthConfig();
}

function loadSessions() {
    try {
        const dir = path.dirname(SESSIONS_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (fs.existsSync(SESSIONS_FILE)) {
            sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
            cleanupExpiredSessions();
        }
    } catch (e) {
        sessions = {};
    }
}

function saveSessions() {
    try {
        fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf-8');
    } catch (e) {
        console.error('Failed to save sessions:', e);
    }
}

function cleanupExpiredSessions() {
    const now = Date.now();
    let changed = false;
    for (const sid of Object.keys(sessions)) {
        if (sessions[sid].expiresAt < now) {
            delete sessions[sid];
            changed = true;
        }
    }
    if (changed) saveSessions();
}

function generateSessionId() {
    return crypto.randomUUID();
}

function createSession() {
    const sid = generateSessionId();
    sessions[sid] = {
        createdAt: Date.now(),
        expiresAt: Date.now() + SESSION_MAX_AGE
    };
    saveSessions();
    return sid;
}

function validateSession(sid) {
    if (!sid || !sessions[sid]) return false;
    if (sessions[sid].expiresAt < Date.now()) {
        delete sessions[sid];
        saveSessions();
        return false;
    }
    // Refresh expiry
    sessions[sid].expiresAt = Date.now() + SESSION_MAX_AGE;
    saveSessions();
    return true;
}

function removeSession(sid) {
    if (sid && sessions[sid]) {
        delete sessions[sid];
        saveSessions();
    }
}

// Express middleware for auth
function requireAuth(req, res, next) {
    if (!isAuthEnabled()) {
        return next();
    }

    const sid = req.cookies?.[COOKIE_NAME];
    if (validateSession(sid)) {
        return next();
    }

    // For API requests, return 401
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Unauthorized', needLogin: true });
    }

    // For page requests, redirect to login
    if (req.path === '/login.html') {
        return next();
    }

    return res.redirect('/login.html');
}

// Auth API handlers
function handleLogin(req, res, next) {
    const config = getAuthConfig();
    if (!config) {
        return res.json({ success: true, message: 'Auth not configured' });
    }

    const { username, password } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    if (username === config.username && password === config.password) {
        const sid = createSession();
        res.cookie(COOKIE_NAME, sid, {
            httpOnly: true,
            sameSite: 'lax',
            maxAge: SESSION_MAX_AGE,
            path: '/'
        });
        return res.json({ success: true });
    }

    return res.status(401).json({ error: 'Invalid username or password' });
}

function handleLogout(req, res) {
    const sid = req.cookies?.[COOKIE_NAME];
    removeSession(sid);
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.json({ success: true });
}

function handleCheckAuth(req, res) {
    if (!isAuthEnabled()) {
        return res.json({ authenticated: true, authEnabled: false });
    }

    const sid = req.cookies?.[COOKIE_NAME];
    const authenticated = validateSession(sid);
    res.json({ authenticated, authEnabled: true });
}

// Initialize
loadSessions();
cleanupExpiredSessions();

module.exports = {
    requireAuth,
    handleLogin,
    handleLogout,
    handleCheckAuth,
    isAuthEnabled,
    COOKIE_NAME
};
