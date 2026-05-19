const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROJECTS_DIR = path.join(__dirname, '..', '..', 'data', 'projects');
const IMAGES_DIR = path.join(__dirname, '..', '..', 'data', 'images');
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

module.exports = {
    saveProject,
    loadProject,
    deleteProject,
    saveImage,
    loadImage,
    deleteImage
};
