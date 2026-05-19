const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROJECTS_DIR = path.join(__dirname, '..', '..', 'data', 'projects');
const IMAGES_DIR = path.join(__dirname, '..', '..', 'data', 'images');
const FONTS_DIR = path.join(__dirname, '..', '..', 'data', 'fonts');
const MAX_VERSIONS = 10;

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

// ===== Project storage =====

function saveProject(id, data) {
    const dir = path.join(PROJECTS_DIR, id);
    ensureDir(dir);

    const version = data._version || Date.now();
    const filename = `${version}.json`;
    const filepath = path.join(dir, filename);

    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
    cleanOldVersions(dir);

    return { _version: version };
}

function loadProject(id) {
    const dir = path.join(PROJECTS_DIR, id);
    if (!fs.existsSync(dir)) return null;

    const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.json'))
        .sort();

    if (files.length === 0) return null;

    const latestFile = files[files.length - 1];
    const content = fs.readFileSync(path.join(dir, latestFile), 'utf-8');
    return JSON.parse(content);
}

function deleteProject(id) {
    const dir = path.join(PROJECTS_DIR, id);
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

function cleanOldVersions(dir) {
    const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.json'))
        .sort();

    if (files.length > MAX_VERSIONS) {
        const toDelete = files.slice(0, files.length - MAX_VERSIONS);
        toDelete.forEach(f => fs.unlinkSync(path.join(dir, f)));
    }
}

// ===== Image storage =====

function md5Hash(buffer) {
    return crypto.createHash('md5').update(buffer).digest('hex');
}

function saveImage(buffer, originalName) {
    const id = md5Hash(buffer);
    ensureDir(IMAGES_DIR);
    const filepath = path.join(IMAGES_DIR, id);
    fs.writeFileSync(filepath, buffer);
    return { id, originalName };
}

function loadImage(id) {
    const filepath = path.join(IMAGES_DIR, id);
    if (!fs.existsSync(filepath)) return null;
    return fs.readFileSync(filepath);
}

function deleteImage(id) {
    const filepath = path.join(IMAGES_DIR, id);
    if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
    }
}

// ===== Font storage =====

function getFontDisplayName(originalName) {
    return (originalName || 'Custom Font')
        .replace(/\.[^.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .trim() || 'Custom Font';
}

function saveFont(buffer, originalName, mimeType, displayName) {
    const id = md5Hash(buffer);
    ensureDir(FONTS_DIR);

    const filepath = path.join(FONTS_DIR, id);
    const metadataPath = path.join(FONTS_DIR, `${id}.json`);
    const metadata = {
        id,
        name: displayName || getFontDisplayName(originalName),
        originalName,
        mimeType,
        size: buffer.length
    };

    fs.writeFileSync(filepath, buffer);
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    return metadata;
}

function loadFont(id) {
    const filepath = path.join(FONTS_DIR, id);
    if (!fs.existsSync(filepath)) return null;

    const metadataPath = path.join(FONTS_DIR, `${id}.json`);
    let metadata = { id, originalName: id, mimeType: 'font/woff2' };
    if (fs.existsSync(metadataPath)) {
        try {
            metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        } catch (e) {
            metadata = { id, originalName: id, mimeType: 'font/woff2' };
        }
    }

    return {
        buffer: fs.readFileSync(filepath),
        metadata
    };
}

function deleteFont(id) {
    const filepath = path.join(FONTS_DIR, id);
    const metadataPath = path.join(FONTS_DIR, `${id}.json`);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    if (fs.existsSync(metadataPath)) fs.unlinkSync(metadataPath);
}

function listFonts() {
    ensureDir(FONTS_DIR);

    return fs.readdirSync(FONTS_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => {
            try {
                const metadata = JSON.parse(fs.readFileSync(path.join(FONTS_DIR, f), 'utf-8'));
                const fontPath = path.join(FONTS_DIR, metadata.id || f.replace(/\.json$/, ''));
                if (!fs.existsSync(fontPath)) return null;
                return {
                    id: metadata.id || f.replace(/\.json$/, ''),
                    name: metadata.name || getFontDisplayName(metadata.originalName),
                    originalName: metadata.originalName,
                    mimeType: metadata.mimeType,
                    size: metadata.size || fs.statSync(fontPath).size
                };
            } catch (e) {
                return null;
            }
        })
        .filter(Boolean)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

function listProjects() {
    ensureDir(PROJECTS_DIR);

    const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
    const projectList = [];

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const projectId = entry.name;
        const projectDir = path.join(PROJECTS_DIR, projectId);

        const files = fs.readdirSync(projectDir)
            .filter(f => f.endsWith('.json'))
            .sort()
            .reverse();

        if (files.length === 0) continue;

        const latestFile = files[0];
        const filePath = path.join(projectDir, latestFile);
        const stat = fs.statSync(filePath);

        try {
            const raw = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(raw);

            projectList.push({
                id: projectId,
                name: data.name || 'Untitled',
                lastModified: stat.mtimeMs,
                screenshotCount: data.screenshots ? data.screenshots.length : 0
            });
        } catch (e) {
            projectList.push({
                id: projectId,
                name: 'Untitled',
                lastModified: stat.mtimeMs,
                screenshotCount: 0
            });
        }
    }

    projectList.sort((a, b) => b.lastModified - a.lastModified);
    return projectList;
}

module.exports = {
    saveProject,
    loadProject,
    deleteProject,
    listProjects,
    saveImage,
    loadImage,
    deleteImage,
    saveFont,
    loadFont,
    deleteFont,
    listFonts
};
