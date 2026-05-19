# 图片上传入口文档

## 概述

所有图片上传入口均在上传时调用 `/api/images/upload` 接口将图片上传到后端，成功后使用相对路径（如 `/api/images/<md5>`）替换原有的 base64 dataURL。上传失败时自动降级为本地 dataURL，不影响编辑。

上传时全屏显示遮罩层（upload-overlay），展示文件名和进度动画，提供取消按钮。

## 上传入口总览

| 入口 | 文件:行号 | 触发方式 | File 对象来源 |
|------|----------|---------|-------------|
| 主截图上传 | `app.js:6309` | `file-input` change / 拖拽到侧边栏 | `e.target.files[i]` |
| 桌面端导入 | `app.js:6148` | Tauri 原生文件选择 | `dataUrlToBlob()` → `new File()` |
| 背景图片 | `app.js:4461` | 右侧面板 Background → Image → Click to upload | `e.target.files[0]` |
| 元素图片 | `app.js:2696` | 右侧面板 Elements → Add Graphic 按钮 | `e.target.files[0]` |
| 翻译图片 | `language-utils.js:362` | 截图语言管理弹窗 | `input.files[0]` |
| 项目导入 | `app.js:4040` | 侧边栏 Import Project Backup | `dataURLToBlob()` → `new File()` |

## 核心函数

### `uploadImageToServer(file)` — `app.js`
```js
async function uploadImageToServer(file) {
    // 1. 显示全局遮罩 (showUploadOverlay)
    // 2. 创建 AbortController（支持取消）
    // 3. fetch POST /api/images/upload (FormData)
    // 4. 成功 → 返回 url（如 "/api/images/abc123..."）
    // 5. 失败 → 返回 null（调用方降级为 dataURL）
    // 6. 隐藏遮罩 (hideUploadOverlay)
    // 7. 401 → 跳转登录页
}
```

### `showUploadOverlay(filename)` / `hideUploadOverlay()` — `app.js`
控制全局上传遮罩的显示/隐藏。

### `dataURLToBlob(dataURL)` — `app.js`
将 base64 dataURL 转换为 Blob，用于桌面端入口（只有 dataUrl，没有 File 对象）。

## 入口流程详解

### 1. 主截图上传 (`processImageFile`)

```
file-input change / drop 事件
  → handleFiles(files)
    → processFilesSequentially(files)
      → processImageFile(file):
          1. reader.readAsDataURL(file)  → dataURL（用于 `img.src` 渲染）
          2. uploadImageToServer(file)   → uploadUrl（服务器相对路径）
          3. finalSrc = uploadUrl || dataURL（上传失败降级）
          4. new Image() → img
          5. detectLanguageFromFilename(file.name) → detectedLang
          6. findScreenshotByBaseFilename(file.name) → existingIndex
          7. 有匹配 → addLocalizedImage()  或 showDuplicateDialog()
          8. 无匹配 → createNewScreenshot(img, finalSrc, ...)
```

### 2. 桌面端导入 (`processDesktopImageFile`)

```
Tauri 文件选择
  → importScreenshotsFromTauri()
    → processDesktopImageFile(fileData):  // fileData = {dataUrl, name}
        1. dataURLToBlob(fileData.dataUrl) → blob
        2. new File([blob], fileData.name)
        3. uploadImageToServer(file)        → uploadUrl
        4. finalSrc = uploadUrl || fileData.dataUrl
        5. new Image() → img（src = dataUrl 用于渲染）
        6. 检测语言 + 匹配 → addLocalizedImage / createNewScreenshot
```

### 3. 背景图片

```
bg-image-input change
  1. uploadImageToServer(file)              → uploadUrl
  2. reader.readAsDataURL(file)             → dataURL
  3. new Image() → img
  4. setBackground('image', img)            → bg.image = img
  5. bg.imageUrl = uploadUrl || dataURL     → 持久化字段
  6. 预览更新
```

### 4. 元素图片 (Graphic)

```
element-graphic-input change
  1. uploadImageToServer(file)              → uploadUrl
  2. reader.readAsDataURL(file)             → dataURL
  3. new Image() → img
  4. addGraphicElement(img, uploadUrl || dataURL, file.name)
```

### 5. 翻译图片

```
translation-file-input change (语言管理弹窗)
  1. uploadImageToServer(file)              → uploadUrl
  2. reader.readAsDataURL(file)             → dataURL
  3. new Image() → img
  4. addLocalizedImage(index, lang, img, uploadUrl || dataURL, file.name)
```

### 6. 项目导入 (Import Project Backup)

```
import-project-input change
  1. 读取 JSON 文件 → 解析 IndexedDB dump
  2. 遍历每个 project record 的 screenshots[]
  3. 检查 screenshot.src 是否为 data: URL → dataURLToBlob → uploadImageToServer → 替换
  4. 检查 localizedImages[lang].src 是否为 data: URL → 同上
  5. 将替换后的 record 写入 IndexedDB
  6. location.reload() 使更新生效
```

## 持久化

### saveState —— 保存时
- 截图 `src` 字段和 `localizedImages[lang].src` 已经是上传后的相对路径（或 dataURL 降级）
- 背景图片通过 `background.imageUrl` 字段持久化
- 默认背景也通过 `defaults.background.imageUrl` 持久化

### loadState —— 加载时
- `getBackground()` 在访问时懒加载图片：检测 `bg.imageUrl` 存在且 `bg.image` 未加载时，创建 `new Image()` 并设置 `src = imageUrl`

### sync-worker.js —— 后台同步时
- PUT 项目前先扫描 `src` / `localizedImages[lang].src` 中的 `data:` URL
- 逐个上传到 `/api/images/upload`
- 替换为返回的相对路径后保存 JSON

## 后端接口

### POST `/api/images/upload`
- Content-Type: `multipart/form-data`
- 字段: `file` (图片二进制), `projectId`
- 响应: `{id: "<md5>", url: "/api/images/<md5>"}`
- 图片 key 由内容 MD5 自动生成，相同内容复用同一文件

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

CSS 类: `.upload-overlay.visible` 显示，进度条 `.upload-overlay-fill.animating` 动画，状态文本 `.upload-overlay-status.error` / `.success` 变色。
