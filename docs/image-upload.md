# 图片上传入口文档

## 概述

所有图片上传入口都会优先调用 `/api/images/upload`，成功后使用相对路径（如 `/api/images/<md5>`）作为持久化字段。编辑预览仍使用浏览器内存中的 `Image` 对象，项目保存时只写可序列化 JSON。

如果某次交互上传失败，调用方会临时保留 data URL 以保证当前编辑不中断。后续 `saveState()` 写项目快照前会再次扫描并上传这些 data URL，尽量让后端项目 JSON 最终只引用图片 API 路径。

## 上传入口总览

| 入口 | 触发方式 | File 对象来源 |
|------|---------|-------------|
| 主截图上传 | `file-input` change / 拖拽到侧边栏 | `e.target.files[i]` |
| 桌面端导入 | Tauri 原生文件选择 | `dataURLToBlob()` → `new File()` |
| 背景图片 | Background → Image → Click to upload | `e.target.files[0]` |
| 元素图片 | Elements → Add Graphic | `e.target.files[0]` |
| 翻译图片 | 截图语言管理弹窗 | `input.files[0]` |
| 项目导入 | Import Project Backup | 备份中的 data URL → `dataURLToBlob()` |

## 核心函数

### `uploadImageToServer(file)`

1. 显示全局上传遮罩。
2. 创建 `AbortController` 支持取消。
3. `POST /api/images/upload`。
4. 成功返回 `/api/images/<id>`。
5. 401 跳转登录页。
6. 失败返回 `null`，调用方用 data URL 继续当前编辑。

### `replaceProjectDataURLs(data)`

保存项目或导入备份前调用：

- 扫描 `screenshots[].src`
- 扫描 `screenshots[].localizedImages[*].src`
- 扫描截图背景和默认背景的 `imageUrl`
- 扫描 graphic 元素的 `src`
- 对仍是 data URL 的值上传图片并替换为 API 路径

## 入口流程

### 主截图上传

```
handleFiles(files)
  → processFilesSequentially(files)
    → processImageFile(file)
      → readAsDataURL(file) for preview
      → uploadImageToServer(file)
      → detectLanguageFromFilename(file.name)
      → addLocalizedImage() or createNewScreenshot()
      → updateCanvas()
```

### 背景和元素图片

```
input change
  → uploadImageToServer(file)
  → readAsDataURL(file) for preview
  → store upload URL when available
  → updateCanvas()
```

### 项目导入

```
import-project-input change
  → parse backup JSON
  → read projects array
  → replaceProjectDataURLs(record)
  → PUT /api/projects/:id
  → reload project list from API
  → load imported current project
```

## 后端接口

### POST `/api/images/upload`

- Content-Type: `multipart/form-data`
- 字段：`file`、`projectId`
- 响应：`{ "id": "<md5>", "url": "/api/images/<md5>" }`
- 图片 key 由内容 MD5 自动生成，相同内容复用同一文件。

## 上传遮罩 DOM

```html
<div class="upload-overlay" id="upload-overlay">
    <div class="upload-overlay-card">
        <div class="upload-overlay-icon">...</div>
        <h3 id="upload-overlay-title">Uploading Image</h3>
        <p id="upload-overlay-filename">image.png</p>
        <div class="upload-overlay-bar">
            <div class="upload-overlay-fill" id="upload-overlay-fill"></div>
        </div>
        <p class="upload-overlay-status" id="upload-overlay-status">Uploading...</p>
        <button class="upload-overlay-cancel" id="upload-overlay-cancel">Cancel</button>
    </div>
</div>
```

CSS 类：`.upload-overlay.visible` 显示，进度条 `.upload-overlay-fill.animating` 动画，状态文本 `.upload-overlay-status.error` / `.success` 变色。
