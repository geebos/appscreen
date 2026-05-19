# App Store Screenshot Generator — 双向存储 & Web Worker 后台同步 技术设计文档

## 1. 概述

### 1.1 设计目标

- **本地 IndexedDB** — 前端主存储，保障离线可用和极速读写
- **Web Worker 后台同步** — 静默推送到后端，**绝不阻塞 UI**
- **时间戳版本号** — 每次 state 快照携带，用于冲突检测和过期丢弃
- **后端 JSON 文件存储** — 轻量零依赖，按 project-id 分目录，保留最近 10 个版本
- **后端代理所有静态文件** — 单一服务统一托管前后端
- **鉴权保护** — 环境变量配置用户名/密码，Cookie 会话管理，多会话并存
- **图片 MD5 去重** — 上传图片以 MD5 为 key，相同内容复用同一文件，节省存储

### 1.2 架构全景

```
┌─── src/web/ (前端) ───────────┐     ┌── src/server/ (后端) ────────┐
│                                │     │                              │
│  index.html                    │     │  server.js                   │
│  login.html                    │     │   ├─ 静态代理 src/web/ → :80 │
│  app.js          IndexedDB     │     │   ├─ PUT  /api/projects/:id │
│    ├─ saveState() ──────┐      │     │   ├─ DELETE /api/projects/:id│
│    ├─ loadState()  ←────┤      │     │   ├─ POST /api/images/upload│
│    └─ sync-worker.js    │      │     │   ├─ GET  /api/images/:id   │
│         (Worker)        │      │     │   ├─ DELETE /api/images/:id │
│         postMessage ───────▶ fetch ─▶│   ├─ POST /api/auth/login   │
│                          │      │     │   ├─ POST /api/auth/logout  │
│  api-client.js           │      │     │   └─ GET  /api/auth/check  │
│   apiSaveProject()       │      │     │                              │
│   apiDeleteProject()     │      │     │  auth.js                     │
│   apiUploadImage()       │      │     │   ├─ requireAuth (middleware)│
│   apiDeleteImage()       │      │     │   ├─ 环境变量 AUTH_USERNAME │
│                           │      │     │   │         AUTH_PASSWORD  │
│                           │      │     │   └─ Cookie: appscreen_... │
│                           │      │     │                              │
│                           │      │     │  storage.js                  │
│                           │      │     │   ├─ saveProject(id,data)   │
│                           │      │     │   ├─ loadProject(id)        │
│                           │      │     │   ├─ deleteProject(id)      │
│                           │      │     │   ├─ saveImage(file)        │
│                           │      │     │   └─ deleteImage(id)       │
│                           │      │     │                              │
│                           │      │     │  存储结构:                   │
│                           │      │     │  data/projects/<pid>/       │
│                           │      │     │    └─ <timestamp>.json      │
│                           │      │     │    (最多保留 10 个快照)      │
│                           │      │     │  data/images/<imageId>      │
│                           │      │     │  data/sessions.json         │
└───────────────────────────┘     └──────────────────────────────────────┘
```

---

## 2. 项目目录结构

```
appscreen/
├── src/
│   ├── web/                          # 前端 (浏览器)
│   │   ├── index.html
│   │   ├── login.html                # 新增: 登录页面
│   │   ├── app.js                    # 主逻辑 (~8500行)
│   │   ├── styles.css
│   │   ├── three-renderer.js
│   │   ├── language-utils.js
│   │   ├── magical-titles.js
│   │   ├── llm.js
│   │   ├── lucide-icons.js
│   │   ├── api-client.js             # 新增: 远程 API 封装
│   │   ├── sync-worker.js            # 新增: Web Worker 后台同步
│   │   ├── img/                      # 图标/图片资源
│   │   │   ├── info.svg
│   │   │   ├── laurel-simple-left.svg
│   │   │   └── laurel-detailed-left.svg
│   │   └── models/                   # 3D 模型
│   │       └── iphone-15-pro-max.glb
│   │
│   └── server/                       # 后端 (Node.js)
│       ├── server.js                 # Express 服务入口
│       ├── storage.js                # JSON 文件存储 (版本化)
│       └── auth.js                   # 鉴权: 会话管理 + 中间件
│
├── data/                             # 运行时数据 (gitignore)
│   ├── projects/                     # 项目数据
│   │   └── <projectId>/              # 每个项目一个目录
│   │       ├── 1737000001001.json    # 版本快照 (时间戳命名)
│   │       ├── 1737000002002.json
│   │       └── ...                   # 最多 10 个
│   ├── images/                       # 上传的图片
│   │   └── <imageId>
│   └── sessions.json                 # 登录会话
│
├── package.json
├── Dockerfile
├── nginx.conf                        # (保留，不再使用，Node.js 内置静态代理)
├── .gitignore
└── docs/
    └── backend-migration-tech-spec.md
```

---

## 3. 鉴权系统

### 3.1 概述

- 通过环境变量 `AUTH_USERNAME` 和 `AUTH_PASSWORD` 启用鉴权
- 如果未设置环境变量，鉴权关闭，所有请求直接通过
- 使用 HTTP-only Cookie 存储会话 ID
- 会话文件 `data/sessions.json` 存储所有活跃会话，支持多设备同时登录
- 会话有效期 7 天，每次请求自动续期
- API 未鉴权返回 401 + `{error, needLogin}`；页面请求未鉴权重定向到 `/login.html`

### 3.2 鉴权接口

| 方法   | 路径                   | 说明               | 请求体                              | 响应                                    |
|--------|------------------------|--------------------|-------------------------------------|-----------------------------------------|
| POST   | `/api/auth/login`      | 登录               | `{username, password}`              | `{success: true}` + Set-Cookie          |
| POST   | `/api/auth/logout`     | 登出               | —                                   | `{success: true}` + Clear-Cookie        |
| GET    | `/api/auth/check`      | 检查登录态         | —                                   | `{authenticated, authEnabled}`          |

### 3.3 登录页面

`login.html` — 独立页面，调用 `/api/auth/check` 检查是否已登录，已登录则自动跳转回 `/`。登录成功后跳转到 `/`。

---

## 4. 后端 API（最少接口原则）

仅保留 **save、delete、图片上传/下载/删除、鉴权**，其余业务均由前端 IndexedDB + saveState 覆盖。

### 4.1 项目接口

| 方法   | 路径                    | 说明                 | 请求体                              | 响应                                         |
|--------|-------------------------|----------------------|-------------------------------------|----------------------------------------------|
| PUT    | `/api/projects/:id`     | 保存项目 (upsert)    | 完整 project JSON (含 `_version`)    | `{_version}` + 响应头 `X-Server-Version`      |
| DELETE | `/api/projects/:id`     | 删除项目及关联图片   | —                                   | `{success: true}`                             |

### 4.2 图片接口

> 图片 key 由后端对上传内容计算 MD5 获得，相同内容复用同一文件。

| 方法   | 路径                     | 说明       | 请求体                              | 响应                                    |
|--------|--------------------------|------------|-------------------------------------|-----------------------------------------|
| POST   | `/api/images/upload`     | 上传图片   | `multipart/form-data`               | `{id: "<md5>", url: "/api/images/<md5>"}` |
| GET    | `/api/images/:id`        | 下载图片   | —                                   | 图片二进制 (Cache-Control: max-age)     |
| DELETE | `/api/images/:id`        | 删除图片   | —                                   | `{success: true}`                      |

### 4.3 不需要的接口及原因

| 接口                             | 被谁替代                                                      |
|----------------------------------|---------------------------------------------------------------|
| `POST /api/projects`             | `createProject()` → `switchProject()` → `saveState()`，首次 PUT 时 upsert |
| `POST /api/projects/:id/duplicate` | `duplicateProject()` → 写 IndexedDB → `switchProject()` → `saveState()` |
| `GET /api/projects/export`       | 前端直接读 IndexedDB 导出 JSON 文件下载                       |
| `POST /api/projects/import`      | 前端读文件 → 写 IndexedDB → `location.reload()`              |
| `GET /api/projects`              | 项目列表由前端 IndexedDB `meta` store 维护                   |
| `GET /api/projects/:id`          | 始终从 IndexedDB 加载（本地优先）                             |
| `GET /api/projects/:id/version`  | 版本号由 PUT 响应头 `X-Server-Version` 返回                   |

---

## 5. 后端存储设计

### 5.1 JSON 文件存储 (`storage.js`)

轻量实现，零数据库依赖。每个 project 的每次保存生成一个带时间戳的快照文件。

```
data/projects/
  └── project_1737000000000/
      ├── 1737000001001.json    ← project 首次保存
      ├── 1737000002002.json    ← 用户修改后保存
      ├── 1737000003003.json    ← 最新版本
      └── ...                   ← 自动清理，只保留最新 10 个
```

### 5.2 核心接口

```
saveProject(id, data):
    dir ← 'data/projects/' + id
    创建 dir (如不存在)
    文件名 ← data._version + '.json'
    写入 dir/文件名
    清理旧文件: 保留最新 10 个，删除其余的
    返回 { _version: data._version }

loadProject(id):
    dir ← 'data/projects/' + id
    列出目录下所有 .json 文件
    返回最新的那个 (按时间戳排序取最后一个)
    如不存在则返回 null

deleteProject(id):
    删除 data/projects/id/ 整个目录

saveImage(buffer, originalName):
    计算 buffer 的 MD5 作为 id
    如果 data/images/id 已存在则跳过写入 (去重)
    写入 data/images/id
    返回 { id, originalName }

loadImage(id):
    读取 data/images/id 返回 buffer

deleteImage(id):
    删除 data/images/id
```

### 5.3 版本清理算法

```
cleanOldVersions(dir):
    files ← readdir(dir).filter(.endsWith('.json')).sort(desc)
    if files.length > 10:
        files.slice(10).forEach(f → fs.unlink(dir + '/' + f))
```

---

## 6. 时间戳版本号

### 6.1 格式与存储位置

```
state._version       = Date.now()    // 毫秒级 Unix 时间戳
state._remoteVersion = 0             // 上次同步后远程确认的版本号
                                     // 存于 IndexedDB meta store: remoteVersion_<projectId>
```

### 6.2 版本号流转

```
saveState()
  │
  ├─ _version = Date.now()
  ├─ IndexedDB.put({... , _version})          ← 本地持久化完成
  └─ worker.postMessage({_version, data})     ← 推送 Worker
         │
         ▼
  Worker: pendingSnapshot ← {_version, data}  ← 栈式替换
         │
         ▼ (2s 防抖)
  Worker: fetch PUT /api/projects/:id
         │
         ▼
  后端: storage.saveProject(id, data)
        写入 data/projects/<id>/<_version>.json
        清理超过 10 个的旧版本
        返回 {_version} + X-Server-Version
         │
         ▼
  Worker: lastSyncedVersion ← serverVersion
          postMessage('synced', serverVersion)
         │
  main:  state._remoteVersion ← serverVersion
```

---

## 7. Web Worker (`src/web/sync-worker.js`)

### 7.1 消息协议

```
主线程 → Worker:
  'init'         {apiBaseURL, projectId, lastRemoteVersion}
  'sync'         {_version, projectId, data}
  'updateConfig' {apiBaseURL, projectId}
  'forceSync'    —

Worker → 主线程:
  'synced'       {_version, serverVersion}
  'syncError'    {_version, error}
  'needLogin'    —
  'log'          {status, detail, time}
```

### 7.2 核心流程（伪代码）

```
内部状态:
  pendingSnapshot  ← null | {_version, projectId, data}
  syncTimer        ← null
  isSyncing        ← false
  lastSyncedVersion ← 0
  apiBaseURL       ← ''

onmessage(msg):
    switch msg.type:
        case 'init':
            apiBaseURL = msg.apiBaseURL || apiBaseURL
            lastSyncedVersion = msg.lastRemoteVersion || 0

        case 'sync':
            pendingSnapshot ← msg           // 覆盖！旧快照丢弃
            scheduleSync()                  // 重置防抖

        case 'forceSync':
            取消防抖; performSync()

scheduleSync():
    clearTimeout(syncTimer)
    syncTimer = setTimeout(performSync, 2000)

performSync():
    if isSyncing or !pendingSnapshot or !apiBaseURL: return
    snapshot ← pendingSnapshot; pendingSnapshot ← null
    if snapshot._version <= lastSyncedVersion: return   // 跳过已同步版本

    isSyncing ← true
    try:
        resp ← fetch PUT apiBaseURL + '/projects/' + snapshot.projectId
               body: { ...snapshot.data, _version: snapshot._version }
        if resp.status === 401: postMessage('needLogin'); return
        lastSyncedVersion ← resp.headers['X-Server-Version']
        postMessage('synced', lastSyncedVersion)
    catch err:
        if !pendingSnapshot: pendingSnapshot ← snapshot   // 放回重试
        postMessage('syncError', {_version: snapshot._version, error: err.message})
    finally:
        isSyncing ← false
```

---

## 8. `src/web/app.js` 变更点

### 8.1 `state` 新增字段

```
state._version       ← Date.now()
state._remoteVersion ← 0
```

### 8.2 `saveState()` — 先 IndexedDB，再推 Worker

```
saveState():
    if !db: return
    state._version ← Date.now()

    // 1. 序列化 (保持现有 base64 图片 dataURL 逻辑不变)
    data ← { id, _version, screenshots: [...], ... }

    // 2. 写入 IndexedDB (同步)
    db.transaction('projects', 'rw').put(data)

    // 3. 推送 Worker (异步，fire-and-forget)
    syncWorker?.postMessage({ type:'sync', _version, projectId: currentProjectId, data })
```

### 8.3 `loadState()` — 从 IndexedDB 加载

```
loadState():
    data ← db.transaction('projects', 'ro').get(currentProjectId)
    if !data: resetToDefaults(); return
    state._version ← data._version
    // 恢复 screenshots (含 Image 对象重建，保持现有逻辑)
    meta ← db.transaction('meta', 'ro').get('remoteVersion_' + currentProjectId)
    state._remoteVersion ← meta || 0
    syncWorker?.postMessage({ type:'updateConfig', projectId, lastRemoteVersion })
```

### 8.4 `init()` — 初始化

```
init():
    db ← openDatabase()
    loadProjectsMeta()
    loadState()
    initSyncWorker()          // new Worker('sync-worker.js')
    syncWorker.postMessage({ type:'init', apiBaseURL, projectId, lastRemoteVersion })
    syncUIWithState()
    updateCanvas()
```

---

## 9. 部署

### 9.1 Dockerfile

```
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json .
RUN npm ci --production
COPY src/ src/
RUN mkdir -p /app/data/projects /app/data/images /app/data/sessions
EXPOSE 80
CMD ["node", "src/server/server.js"]
```

### 9.2 docker-compose

```yaml
services:
  appscreen:
    image: ghcr.io/yuzu-hub/appscreen:latest
    ports:
      - "8080:80"
    environment:
      - AUTH_USERNAME=${AUTH_USERNAME:-}
      - AUTH_PASSWORD=${AUTH_PASSWORD:-}
    volumes:
      - ./data:/app/data
```

---

## 10. 实施步骤

1. 创建目录结构 `src/web/`、`src/server/`、`data/projects/`、`data/images/` ✓
2. 移动现有前端文件到 `src/web/` ✓
3. 创建 `src/server/storage.js` — JSON 文件存储 + 最多 10 版本清理 ✓
4. 创建 `src/server/auth.js` — 鉴权系统 (会话管理 + 中间件) ✓
5. 创建 `src/server/server.js` — Express 静态代理 + REST API + 鉴权 ✓
6. 创建 `src/web/login.html` — 登录页面 ✓
7. 更新 `package.json` — 脚本和依赖 ✓
8. 更新 `Dockerfile` — 从 nginx 迁移到 Node.js ✓
9. 更新 `docker-compose.yml` / `docker-compose.build.yml` — 环境变量 + 持久化 ✓
10. 更新 `.gitignore` / `.dockerignore` ✓
11. 创建 `src/web/api-client.js` ✓
12. 创建 `src/web/sync-worker.js` ✓
13. 修改 `src/web/app.js` — saveState/loadState/init/switchProject/deleteProject ✓
14. 修改 `src/web/index.html` — 引入新脚本 ✓
