# 项目元信息后端化说明

## 结论

项目元信息已经随项目快照保存在后端，`projects` 列表由 `GET /api/projects` 返回。客户端不再维护持久化的本地项目目录。

## 数据来源

| 数据 | 来源 |
|------|------|
| 项目列表 | `GET /api/projects` 扫描 `data/projects/*` 的最新快照 |
| 项目名 | 项目 JSON 的 `name` 字段 |
| 截图数量 | 最新项目 JSON 的 `screenshots.length` |
| 当前项目内容 | `GET /api/projects/:id` |
| 当前会话选中的项目 | 前端运行时变量 `currentProjectId` |

## 创建与重命名

- `createProject(name)` 先 flush 当前项目，再生成新项目 ID，重置默认状态，写入 `name`，最后 `PUT /api/projects/:id`。
- `renameProject(newName)` 更新 `state.name` 和内存项目列表，然后由 `saveState()` 写回后端。

## 删除与复制

- `deleteProject()` 取消该项目的待保存快照，等待当前保存完成后调用 `DELETE /api/projects/:id`，再加载剩余项目。
- `duplicateProject()` 从后端读取源项目快照，复制为新 ID 和新 `name`，再通过 `PUT /api/projects/:id` 创建副本。

## 导入兼容

导入逻辑读取备份中的 `projects` 数组。旧版备份中的项目记录仍可导入；导入时会上传内联图片并写回后端项目 API。

## 不再需要的客户端职责

- 不再保存项目列表副本。
- 不再在客户端维护项目元信息缓存。
- 不再通过刷新页面完成导入后的状态切换。
