# 后端 API 项目存储技术方案

## 目标

项目数据以服务端 REST API 为唯一持久化来源。前端只保留运行时内存状态，所有项目列表、项目快照、图片资源、导入导出都通过后端 API 完成。

## 当前架构

```
src/web/app.js
  ├─ init()                 GET /api/projects, GET /api/projects/:id
  ├─ saveState()            debounced PUT /api/projects/:id
  ├─ switchProject()        flush current save, then GET target project
  ├─ createProject()        create in memory, then PUT new project
  ├─ duplicateProject()     GET source project, PUT cloned project
  ├─ deleteProject()        DELETE /api/projects/:id
  ├─ export backup          GET list + GET every project
  └─ import backup          upload embedded images, PUT every project

src/server/server.js
  ├─ GET    /api/projects
  ├─ GET    /api/projects/:id
  ├─ PUT    /api/projects/:id
  ├─ DELETE /api/projects/:id
  ├─ POST   /api/images/upload
  ├─ GET    /api/images/:id
  └─ DELETE /api/images/:id
```

## 保存流程

1. UI 修改运行时 `state`。
2. `updateCanvas()` 调用 `saveState()`。
3. `saveState()` 生成纯 JSON 快照，移除 `Image` 等运行时对象。
4. 保存队列用 800ms debounce 合并连续编辑。
5. PUT 前扫描项目快照里的 `data:` 图片；仍未上传的图片会先 POST 到 `/api/images/upload`，再把字段替换为 `/api/images/<id>`。
6. `apiSaveProject()` PUT 完整项目 JSON，服务端写入 `data/projects/<projectId>/<timestamp>.json`。

## 加载流程

1. `loadProjectsFromServer()` 调用 `GET /api/projects` 获取项目列表。
2. `loadState()` 调用 `GET /api/projects/:id` 获取当前项目最新快照。
3. `applyProjectData()` 重建图片对象、图标对象、语言图片和 UI 状态。
4. 项目不存在时创建默认项目，并在应用 ready 后首次保存到后端。

## 导入导出

- 导出：先 flush 当前项目，再拉取项目列表和每个项目快照，生成 JSON 备份。
- 导入：读取备份中的 `projects` 数组，上传其中仍以内联 data URL 存放的图片，然后逐个 PUT 到后端。
- 备份格式保留 `meta.currentProject`，导入完成后优先打开该项目。

## 后端存储

- 项目快照：`data/projects/<projectId>/<timestamp>.json`
- 每个项目保留最新 10 个快照。
- 图片文件：`data/images/<md5>`，内容相同的图片自动复用。
- 会话：`data/sessions.json`

## 约束

- 前端不依赖浏览器数据库或离线缓存保存项目。
- 静态文件直开模式不再提供项目持久化；需要通过 Express 服务访问。
- API 返回 401 时跳转到 `/login.html`。
