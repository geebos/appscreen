// Web Worker for background sync to server

let pendingSnapshot = null;
let syncTimer = null;
let isSyncing = false;
let lastSyncedVersion = 0;
let apiBaseURL = '';
let projectId = '';

self.addEventListener('message', function (e) {
    const msg = e.data;

    switch (msg.type) {
        case 'init':
            apiBaseURL = msg.apiBaseURL || apiBaseURL;
            projectId = msg.projectId || projectId;
            lastSyncedVersion = msg.lastRemoteVersion || 0;
            postLog('Worker initialized', { apiBaseURL, projectId, lastSyncedVersion });
            break;

        case 'updateConfig':
            if (msg.apiBaseURL !== undefined) apiBaseURL = msg.apiBaseURL;
            if (msg.projectId !== undefined) projectId = msg.projectId;
            if (msg.lastRemoteVersion !== undefined) lastSyncedVersion = msg.lastRemoteVersion;
            break;

        case 'sync':
            // Stack replacement: only keep the latest snapshot
            pendingSnapshot = {
                _version: msg._version,
                projectId: msg.projectId || projectId,
                data: msg.data
            };
            scheduleSync();
            break;

        case 'forceSync':
            clearTimeout(syncTimer);
            syncTimer = null;
            performSync();
            break;
    }
});

function scheduleSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(performSync, 2000);
}

function postLog(status, detail) {
    self.postMessage({ type: 'log', status, detail: JSON.stringify(detail), time: Date.now() });
}

// Convert a data URL to a Blob
function dataURLToBlob(dataURL) {
    const parts = dataURL.split(',');
    const mime = parts[0].match(/:(.*?);/);
    const mimeType = mime ? mime[1] : 'image/png';
    const byteString = atob(parts[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeType });
}

// Upload an image data URL, return the server URL (relative path)
async function uploadImage(dataURL, imageName) {
    try {
        const blob = dataURLToBlob(dataURL);
        const formData = new FormData();
        formData.append('file', blob, imageName || 'screenshot.png');

        const base = apiBaseURL || location.origin;
        const resp = await fetch(`${base}/api/images/upload`, {
            method: 'POST',
            body: formData
        });

        if (resp.status === 401) {
            self.postMessage({ type: 'needLogin' });
            return null;
        }

        if (!resp.ok) {
            throw new Error(`Upload failed: HTTP ${resp.status}`);
        }

        const result = await resp.json();
        return result.url; // e.g. /api/images/abc123
    } catch (err) {
        postLog('image-upload-error', { name: imageName, error: err.message });
        return null;
    }
}

// Scan project data for data URLs, upload them, replace src with relative paths
async function replaceImagesWithURLs(data) {
    const screenshots = data.screenshots;
    if (!screenshots || !Array.isArray(screenshots)) return;

    for (const screenshot of screenshots) {
        // Main screenshot image
        if (screenshot.src && screenshot.src.startsWith('data:')) {
            const url = await uploadImage(screenshot.src, screenshot.name || 'screenshot.png');
            if (url) {
                screenshot.src = url;
            }
        }

        // Localized images
        if (screenshot.localizedImages) {
            for (const lang of Object.keys(screenshot.localizedImages)) {
                const li = screenshot.localizedImages[lang];
                if (li && li.src && li.src.startsWith('data:')) {
                    const url = await uploadImage(li.src, li.name || 'screenshot.png');
                    if (url) {
                        li.src = url;
                    }
                }
            }
        }
    }
}

async function performSync() {
    if (isSyncing) return;
    if (!pendingSnapshot) return;
    if (!apiBaseURL && !location?.origin) return;

    const snapshot = pendingSnapshot;
    pendingSnapshot = null;

    if (snapshot._version <= lastSyncedVersion) {
        postLog('skip', { reason: 'version already synced', _version: snapshot._version, lastSyncedVersion });
        return;
    }

    isSyncing = true;

    try {
        // Deep clone data to avoid mutating the snapshot reference
        const data = JSON.parse(JSON.stringify(snapshot.data));
        data._version = snapshot._version;

        // Upload images and replace data URLs with server URLs
        postLog('uploading-images', { projectId: snapshot.projectId });
        await replaceImagesWithURLs(data);

        const base = apiBaseURL || location.origin;
        const url = `${base}/api/projects/${encodeURIComponent(snapshot.projectId)}`;

        postLog('sync-start', { _version: snapshot._version, url });

        const resp = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (resp.status === 401) {
            // Auth required — signal to main thread
            self.postMessage({ type: 'needLogin' });
            isSyncing = false;
            return;
        }

        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
        }

        const result = await resp.json();
        const serverVersion = resp.headers.get('X-Server-Version');
        const syncedVersion = serverVersion ? Number(serverVersion) : (result._version || snapshot._version);

        lastSyncedVersion = syncedVersion;
        self.postMessage({ type: 'synced', _version: syncedVersion, serverVersion: syncedVersion });
        postLog('sync-done', { _version: syncedVersion });
    } catch (err) {
        // If no new snapshot has arrived, put this one back for retry
        if (!pendingSnapshot) {
            pendingSnapshot = snapshot;
        }
        self.postMessage({ type: 'syncError', _version: snapshot._version, error: err.message });
        postLog('sync-error', { _version: snapshot._version, error: err.message });
    } finally {
        isSyncing = false;
    }
}
