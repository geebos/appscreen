// Remote API client for server-side project/image storage

async function apiSaveProject(id, data) {
    try {
        const resp = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (resp.status === 401) {
            window.location.href = '/login.html';
            return null;
        }

        if (!resp.ok) {
            throw new Error(`Error ${resp.status}`);
        }

        const result = await resp.json();
        const serverVersion = resp.headers.get('X-Server-Version');
        return { ...result, _serverVersion: serverVersion ? Number(serverVersion) : result._version };
    } catch (e) {
        console.warn('apiSaveProject failed:', e.message);
        return null;
    }
}

async function apiDeleteProject(id) {
    try {
        const resp = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
            method: 'DELETE'
        });

        if (resp.status === 401) {
            window.location.href = '/login.html';
            return false;
        }

        return resp.ok;
    } catch (e) {
        console.warn('apiDeleteProject failed:', e.message);
        return false;
    }
}

async function apiUploadImage(file, projectId) {
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('projectId', projectId);

        const resp = await fetch('/api/images/upload', {
            method: 'POST',
            body: formData
        });

        if (resp.status === 401) {
            window.location.href = '/login.html';
            return null;
        }

        if (!resp.ok) {
            throw new Error(`Error ${resp.status}`);
        }

        return await resp.json();
    } catch (e) {
        console.warn('apiUploadImage failed:', e.message);
        return null;
    }
}

async function apiUploadFont(file, projectId, name) {
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('projectId', projectId);
        if (name) formData.append('name', name);

        const resp = await fetch('/api/fonts/upload', {
            method: 'POST',
            body: formData
        });

        if (resp.status === 401) {
            window.location.href = '/login.html';
            return null;
        }

        if (!resp.ok) {
            throw new Error(`Error ${resp.status}`);
        }

        return await resp.json();
    } catch (e) {
        console.warn('apiUploadFont failed:', e.message);
        return null;
    }
}

async function apiListFonts() {
    try {
        const resp = await fetch('/api/fonts', { credentials: 'same-origin' });

        if (resp.status === 401) {
            window.location.href = '/login.html';
            return null;
        }

        if (!resp.ok) {
            throw new Error(`Error ${resp.status}`);
        }

        return await resp.json();
    } catch (e) {
        console.warn('apiListFonts failed:', e.message);
        return null;
    }
}

async function apiLoadProject(id) {
    try {
        const resp = await fetch(`/api/projects/${encodeURIComponent(id)}`);

        if (resp.status === 401) {
            window.location.href = '/login.html';
            return null;
        }

        if (resp.status === 404) {
            return null;
        }

        if (!resp.ok) {
            throw new Error(`Error ${resp.status}`);
        }

        const data = await resp.json();
        const serverVersion = resp.headers.get('X-Server-Version');
        return { ...data, _serverVersion: serverVersion ? Number(serverVersion) : data._version };
    } catch (e) {
        console.warn('apiLoadProject failed:', e.message);
        return null;
    }
}

async function apiDeleteImage(id) {
    try {
        const resp = await fetch(`/api/images/${encodeURIComponent(id)}`, {
            method: 'DELETE'
        });

        if (resp.status === 401) {
            window.location.href = '/login.html';
            return false;
        }

        return resp.ok;
    } catch (e) {
        console.warn('apiDeleteImage failed:', e.message);
        return false;
    }
}

async function apiListProjects() {
    try {
        const resp = await fetch('/api/projects', { credentials: 'same-origin' });

        if (resp.status === 401) {
            window.location.href = '/login.html';
            return null;
        }

        if (!resp.ok) {
            throw new Error(`Error ${resp.status}`);
        }

        return await resp.json();
    } catch (e) {
        console.warn('apiListProjects failed:', e.message);
        return null;
    }
}
