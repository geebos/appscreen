# 迁移到 React + Next.js + Tailwind CSS + shadcn/ui

## 目标

将当前原生 HTML/CSS/JavaScript + Express 的截图生成器迁移为 React + Next.js App Router + Tailwind CSS + shadcn/ui。迁移完成后，项目数据、图片数据、项目列表、当前项目版本等业务持久化数据全部以后端为唯一数据源，不再使用 IndexedDB。

最终状态：

- 前端使用 Next.js App Router，页面、布局、API 路由统一在 Next 工程中维护。
- 复杂编辑器仍然是浏览器端交互组件，但初始数据来自后端，保存直接写后端。
- 新项目包管理工具统一使用 `pnpm`，提交 `pnpm-lock.yaml`，不再使用 `package-lock.json`。
- Tailwind CSS 承担全部页面和组件样式迁移；旧 `styles.css` 只作为迁移参考，不复制为运行时样式文件。
- 通用 UI 控件全部替换为 shadcn/ui 组件；业务组件只负责组合 shadcn 组件、Canvas、Three.js 和应用状态。
- 后端保留当前 JSON 文件存储能力，也可以后续替换为数据库；前端不感知具体存储实现。
- 删除 `indexedDB`、`PROJECTS_STORE`、`META_STORE`、`openDatabase()`、`sync-worker.js` 等本地持久化链路。
- 项目 JSON 中不再持久化 `data:` 图片；图片必须先上传到后端并以 `/api/images/:id` 形式引用。
- 新增自定义字体能力：用户可上传字体文件，在 Text 样式中选择自定义字体，Canvas 预览和导出都必须正确加载该字体。
- 新 React/Next 项目先放在仓库根目录的 `migrate/` 下独立开发和验证，迁移完成后再整体替换旧项目。
- 迁移后不再支持 Tauri；`src-tauri/`、Tauri 菜单、桌面壳和原生文件导入能力不迁移。

## 当前项目结构

```text
appscreen/
├── src/
│   ├── web/
│   │   ├── index.html              # 主编辑器 DOM、弹窗、上传遮罩、Tauri 桥接
│   │   ├── login.html              # 登录页
│   │   ├── styles.css              # 当前全局样式、布局、主题
│   │   ├── app.js                  # 主应用逻辑、状态、Canvas 渲染、项目管理
│   │   ├── api-client.js           # 浏览器端 REST API 封装
│   │   ├── sync-worker.js          # IndexedDB 后的后台同步 worker
│   │   ├── three-renderer.js       # Three.js 3D 设备渲染
│   │   ├── language-utils.js       # 语言检测、本地化截图、重复上传处理
│   │   ├── magical-titles.js       # AI 营销标题能力
│   │   ├── llm.js                  # Claude/OpenAI/Google provider 配置
│   │   ├── lucide-icons.js         # 图标选择器数据
│   │   ├── img/                    # 静态图片、图标、装饰素材
│   │   └── models/                 # GLB 设备模型
│   └── server/
│       ├── server.js               # Express 服务、静态资源、API 路由
│       ├── storage.js              # 文件系统 JSON 项目存储和图片存储
│       └── auth.js                 # Cookie session 鉴权
├── src-tauri/                      # 旧版 Tauri 桌面壳，迁移后不保留
├── data/
│   ├── projects/<projectId>/       # 项目版本快照，最多保留 10 个 JSON
│   ├── images/<md5>                # 图片二进制，按 MD5 去重
│   └── sessions.json               # 登录 session
├── docs/                           # 技术文档
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
└── package.json
```

## 当前功能点

| 模块 | 功能 |
| --- | --- |
| 项目管理 | 创建、重命名、删除、复制项目；项目选择器；项目 JSON 导入导出 |
| 截图管理 | 上传多张截图、空白截图、替换截图、复制截图、拖拽排序、样式批量应用 |
| 输出尺寸 | iPhone 6.9/6.7/6.5/5.5、iPad 12.9/11、自定义尺寸 |
| 背景 | 多色渐变、纯色、图片背景、图片模糊、遮罩、噪声 |
| 设备 Mockup | 2D 截图定位、缩放、旋转、圆角、阴影、边框；3D iPhone/Samsung GLB 模型 |
| 文案 | headline/subheadline、多字体、字号、字重、斜体、下划线、删除线、颜色、行高、上下位置 |
| 字体管理（新增） | 上传自定义字体、管理字体列表、在 headline/subheadline 和文本元素中选择自定义字体 |
| 多语言 | 项目语言列表、语言切换、文件名语言检测、本地化截图、重复上传处理、多语言导出 |
| 元素层 | 图片元素、文本元素、emoji、Lucide icon、装饰框、层级移动、画布拖拽 |
| Popout | 局部放大/弹出效果，支持裁切预览和拖拽调整 |
| AI | AI 翻译、AI 标题生成；Claude/OpenAI/Google provider |
| 导出 | 导出当前截图、批量 ZIP 导出、按当前语言或全部语言导出 |
| 后端 | 项目保存/读取/列表/删除、图片和字体上传/读取/删除、Cookie 鉴权、健康检查 |
| 旧版 Tauri | 桌面窗口、菜单动作、原生文件导入、外链打开；迁移后不支持 |

## 当前数据流

### 项目数据

当前主链路是“本地 IndexedDB 优先，后台同步到后端”：

```text
init()
  -> openDatabase()
  -> loadProjectsFromServer()
  -> loadState()                 # 从 IndexedDB PROJECTS_STORE 读当前项目
  -> pullLatestFromServer()      # 发现服务端更新后再写回 IndexedDB
  -> initSyncWorker()

saveState()
  -> state._version = Date.now()
  -> IndexedDB PROJECTS_STORE.put(stateToSave)
  -> IndexedDB META_STORE.put(projects/currentProject/remoteVersion)
  -> syncWorker.postMessage({ type: "sync", data: stateToSave })

sync-worker.js
  -> 2s debounce
  -> 扫描 data: 图片并上传
  -> PUT /api/projects/:id
```

这会导致两个事实：

- 前端本地库仍然是事实上的主存储，后端是异步副本。
- 项目列表、当前项目、远端版本依赖 IndexedDB 的 `meta` store。

### 图片数据

当前上传入口已经会尝试先上传到后端：

- 主截图上传
- 旧版桌面端导入
- 背景图片
- 元素图片
- 翻译截图
- 项目备份导入中的 data URL 图片

但上传失败时会回退到 `data:` URL，并且 `sync-worker.js` 后续再尝试上传。这一回退策略在移除 IndexedDB 后需要改掉：持久化项目 JSON 时不允许再保存 `data:` URL。

## 目标技术栈

```text
Next.js App Router
React
TypeScript
Tailwind CSS
shadcn/ui
pnpm
Three.js
JSZip
lucide-react
```

新项目使用 `pnpm`。旧项目根目录当前仍保留 `npm` 和 `package-lock.json`，但 `migrate/` 内必须使用 `pnpm` 和 `pnpm-lock.yaml`：

```bash
pnpm create next-app@latest migrate --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
cd migrate
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button input textarea field select slider switch checkbox radio-group toggle-group dialog alert-dialog dropdown-menu context-menu tabs tooltip popover hover-card scroll-area separator badge progress skeleton sheet drawer accordion collapsible sonner command card table avatar sidebar breadcrumb navigation-menu pagination resizable
```

`migrate/package.json` 必须写入 `packageManager` 字段并提交 `pnpm-lock.yaml`。任何新增依赖都使用 `pnpm add` / `pnpm add -D`，任何 shadcn 组件都使用 `pnpm dlx shadcn@latest add ...`。

不要在仓库根目录直接初始化 Next 项目。根目录继续保持当前可运行版本，`migrate/` 作为新项目工作区；验证通过后再执行整体替换。

## 迁移工作目录策略

迁移期间采用“双目录”策略：

```text
appscreen/
├── src/                 # 旧项目，迁移期间继续可运行
├── src-tauri/           # 旧 Tauri 配置，迁移期间仅作为参考，最终删除或归档
├── data/                # 共享运行数据，不移动、不覆盖
├── docs/
├── migrate/             # 新 React + Next + Tailwind + shadcn 项目
│   ├── public/
│   ├── src/
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── next.config.ts
│   └── ...
└── package.json         # 旧项目 package.json，替换前保留
```

要求：

- `migrate/` 内必须是完整可独立启动的新项目。
- 迁移开发期间不修改旧入口 `src/web/index.html` 和旧 `src/web/app.js`，除非是为了临时兼容数据导出。
- `data/` 仍位于仓库根目录，`migrate/` 开发环境通过 `DATA_DIR=../data` 读取旧数据。
- `migrate/` 的 API 必须兼容现有 `data/projects` 和 `data/images` 格式，确保替换时不迁移运行数据目录。
- 旧项目验证、用户使用和新项目开发互不影响。
- 最终替换时保留 `.git/`、`data/`、`docs/`、`uploads/` 和必要的部署配置，只用 `migrate/` 中的新实现替换旧应用代码和构建配置；`src-tauri/` 不合并到新项目。

## 目标目录结构

```text
appscreen/migrate/
├── public/
│   ├── img/                       # 从 src/web/img 迁移
│   └── models/                    # 从 src/web/models 迁移
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── globals.css            # Tailwind + shadcn tokens
│   │   ├── page.tsx               # 编辑器首页，服务端加载初始项目列表
│   │   ├── login/page.tsx
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── login/route.ts
│   │       │   ├── logout/route.ts
│   │       │   └── check/route.ts
│   │       ├── projects/
│   │       │   ├── route.ts       # GET list, POST create/import
│   │       │   └── [id]/route.ts  # GET, PUT, DELETE
│   │       ├── images/
│   │       │   ├── upload/route.ts
│   │       │   └── [id]/route.ts
│   │       └── fonts/
│   │           ├── route.ts        # GET list
│   │           ├── upload/route.ts # POST upload font
│   │           └── [id]/route.ts   # GET, DELETE
│   ├── components/
│   │   ├── ui/                    # shadcn/ui 生成
│   │   └── editor/
│   │       ├── editor-shell.tsx
│   │       ├── project-sidebar.tsx
│   │       ├── screenshot-list.tsx
│   │       ├── preview-stage.tsx
│   │       ├── side-preview-strip.tsx
│   │       ├── inspector/
│   │       │   ├── background-panel.tsx
│   │       │   ├── device-panel.tsx
│   │       │   ├── text-panel.tsx
│   │       │   ├── elements-panel.tsx
│   │       │   └── popouts-panel.tsx
│   │       ├── dialogs/
│   │       └── pickers/
│   ├── hooks/
│   │   ├── use-autosave.ts
│   │   ├── use-project-editor.ts
│   │   ├── use-upload-image.ts
│   │   └── use-theme-preference.ts
│   ├── lib/
│   │   ├── project-schema.ts
│   │   ├── project-serializer.ts
│   │   ├── api-client.ts
│   │   ├── language.ts
│   │   ├── fonts.ts
│   │   ├── canvas/
│   │   │   ├── renderer.ts
│   │   │   ├── background.ts
│   │   │   ├── screenshot.ts
│   │   │   ├── text.ts
│   │   │   ├── elements.ts
│   │   │   └── export.ts
│   │   ├── three/
│   │   │   └── device-renderer.ts
│   │   └── server/
│   │       ├── auth.ts
│   │       ├── storage.ts
│   │       ├── sessions.ts
│   │       └── paths.ts
│   └── middleware.ts              # 鉴权保护页面和 API
└── package.json
```

## 目标数据模型

先把当前隐式 JSON 固化为 TypeScript 类型，迁移时所有读写都经过序列化层。

```ts
export type ProjectSummary = {
  id: string
  name: string
  lastModified: number
  screenshotCount: number
  version: number
}

export type ProjectSnapshot = {
  id: string
  name: string
  _version: number
  formatVersion: number
  screenshots: ScreenshotState[]
  selectedIndex: number
  outputDevice: string
  customWidth: number
  customHeight: number
  currentLanguage: string
  projectLanguages: string[]
  customFonts: CustomFontRef[]
  defaults: ProjectDefaults
}

export type PersistedImageRef = {
  src: string       // 必须是 /api/images/:id 或绝对 URL，不允许 data:
  name: string
}

export type CustomFontRef = {
  id: string
  family: string
  originalName: string
  url: string       // 必须是 /api/fonts/:id
  format: "woff2" | "woff" | "ttf" | "otf"
  weight?: string
  style?: "normal" | "italic"
}

export type TextFontSelection =
  | { source: "system"; family: string }
  | { source: "google"; family: string }
  | { source: "custom"; id: string; family: string; url: string }
```

保存前必须验证：

- `project.id` 与 URL 中的 `:id` 一致。
- `project.name` 存在，不能只存在于项目列表缓存。
- `screenshots[*].src`、`localizedImages[*].src`、`background.imageUrl`、元素图片 `src` 不允许是 `data:`。
- 自定义字体只能保存 `CustomFontRef` 元数据和 `/api/fonts/:id` 引用，不允许把字体转成 base64 写入项目 JSON。
- 文本样式中的字体字段必须能区分系统字体、Google Fonts 和自定义字体，避免同名字体冲突。
- 运行时 `HTMLImageElement`、`AbortController`、Canvas context、拖拽状态等对象不得进入 JSON。

## 后端 API 设计

可以先保持当前文件系统存储，迁移到 Next Route Handlers：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/projects` | 返回项目列表 |
| `POST` | `/api/projects` | 创建空项目或导入项目，返回完整项目 |
| `GET` | `/api/projects/:id` | 读取最新项目快照 |
| `PUT` | `/api/projects/:id` | 保存完整项目快照 |
| `DELETE` | `/api/projects/:id` | 删除项目 |
| `POST` | `/api/images/upload` | 上传图片，返回 `{ id, url }` |
| `GET` | `/api/images/:id` | 读取图片 |
| `DELETE` | `/api/images/:id` | 删除图片 |
| `GET` | `/api/fonts` | 返回自定义字体列表 |
| `POST` | `/api/fonts/upload` | 上传字体，返回 `CustomFontRef` |
| `GET` | `/api/fonts/:id` | 读取字体文件 |
| `DELETE` | `/api/fonts/:id` | 删除字体 |
| `POST` | `/api/auth/login` | 登录 |
| `POST` | `/api/auth/logout` | 登出 |
| `GET` | `/api/auth/check` | 检查登录状态 |

建议保存时由服务端生成新版本：

```text
PUT /api/projects/:id
body: { baseVersion: number, project: ProjectSnapshot }

server:
  latest = loadProject(id)
  if latest._version !== baseVersion:
    return 409 Conflict
  project._version = Date.now()
  saveProject(id, project)
  return project with X-Server-Version
```

这样多标签页或多人访问时，不会无声覆盖更新。第一阶段也可以兼容当前 `_version = Date.now()` 的客户端版本策略，但迁移后更推荐由后端分配版本。

自定义字体 API 约束：

- 支持 `.woff2`、`.woff`、`.ttf`、`.otf`。
- 服务端校验 MIME、扩展名和文件大小，默认建议单文件不超过 20 MB。
- 字体文件保存到 `data/fonts/<hash>`，用内容 hash 去重。
- 字体元数据保存到 `data/fonts/index.json` 或同等后端存储中，至少包含 `id`、`family`、`originalName`、`url`、`format`、`createdAt`。
- `GET /api/fonts/:id` 返回正确 `Content-Type` 和长期缓存头。
- 删除字体时，如果仍有项目引用，需要拒绝删除或给出清晰的引用提示。

## 移除 IndexedDB 的具体改造点

| 当前代码 | 迁移后 |
| --- | --- |
| `db`、`DB_NAME`、`DB_VERSION`、`PROJECTS_STORE`、`META_STORE` | 删除 |
| `openDatabase()` | 删除 |
| `loadProjectsMeta()`、`saveProjectsMeta()` | 删除，项目列表来自 `GET /api/projects` |
| `loadProjectsFromServer()` | 改为唯一项目列表加载函数，不再 fallback IndexedDB |
| `loadState()` | 改为 `GET /api/projects/:id` |
| `saveState()` | 改为序列化后 debounce `PUT /api/projects/:id` |
| `pullLatestFromServer()` | 删除；项目切换和页面聚焦时重新 `GET` 即可 |
| `initSyncWorker()`、`syncWorker` | 删除 |
| `src/web/sync-worker.js` | 删除 |
| `remoteVersion_*` meta | 删除，版本来自后端响应 |
| 项目导出 | 改为导出当前内存项目或调用后端导出，不再 dump IndexedDB object stores |
| 项目导入 | 改为上传 JSON 到后端，图片 data URL 先上传，再创建项目 |
| 图片上传失败回退到持久化 `data:` | 禁止；只允许临时预览，保存前必须上传成功 |

迁移后的主数据流：

```text
page.tsx
  -> getProjectSummaries()
  -> getInitialProject()
  -> <EditorShell initialProjects initialProject />

EditorShell
  -> useReducer/useProjectEditor 管理编辑中的内存状态
  -> useAutosave 监听 dirty state
  -> debounce PUT /api/projects/:id
  -> 保存成功后更新 project._version

图片入口
  -> POST /api/images/upload
  -> 成功后把 /api/images/:id 写入 editor state
  -> 失败则提示用户重试，不保存 data URL

字体入口
  -> POST /api/fonts/upload
  -> 成功后返回 CustomFontRef
  -> 用 FontFace API 加载 /api/fonts/:id
  -> TextPanel 字体选择器出现该字体
  -> 保存项目时只保存字体引用和文本样式

项目切换
  -> 如果当前 dirty，先 flush autosave
  -> GET /api/projects/:id
  -> replace editor state
```

## React 组件拆分

### 服务端组件

- `src/app/layout.tsx`：全局结构、字体、metadata、`Toaster`。
- `src/app/page.tsx`：读取项目列表和默认项目，传给客户端编辑器。
- `src/app/login/page.tsx`：登录页可以是客户端表单，也可以用 Server Action。

### 客户端组件

编辑器主体必须是客户端组件，因为它依赖 Canvas、拖拽、文件上传、Three.js 和大量事件：

- `EditorShell`：编辑器顶层状态、快捷保存、项目切换。
- `ProjectSidebar`：项目选择、项目增删改、截图列表、导出入口。
- `PreviewStage`：主 Canvas、左右预览、手势切换。
- `InspectorTabs`：右侧设置面板，使用 shadcn `Tabs`。
- `BackgroundPanel`：背景类型、渐变 stops、图片上传、噪声。
- `DevicePanel`：设备尺寸、2D/3D、缩放、位置、阴影、边框。
- `TextPanel`：headline/subheadline、多语言、字体、排版。
- `FontManagerDialog`：上传、预览、删除自定义字体。
- `FontPicker`：统一选择系统字体、Google Fonts 和自定义字体。
- `ElementsPanel`：图形、文本、emoji、icon、层级、属性编辑。
- `PopoutsPanel`：局部放大设置、裁切预览。
- `LanguageDialog`、`TranslateDialog`、`ProjectDialog`、`DeleteProjectDialog`、`ExportDialog`：全部使用 shadcn `Dialog`/`AlertDialog`。

Canvas 渲染逻辑不要直接写进 React 组件主体。应迁移到 `src/lib/canvas/*` 的纯函数，组件只负责收集 canvas ref、调用 renderer、响应事件。

## shadcn/ui 对照

| 当前 UI | shadcn/ui |
| --- | --- |
| 普通按钮、图标按钮 | `Button` |
| 项目选择下拉 | `DropdownMenu` 或 `Select` |
| 右侧设置 tabs | `Tabs` |
| 折叠设置段落 | `Accordion` 或 `Collapsible` |
| 删除确认 | `AlertDialog` |
| 项目命名、语言管理、翻译、导出进度 | `Dialog` |
| 文本输入 | `Input`、`Textarea` |
| 下拉选择 | `Select` |
| 开关 | `Switch` |
| 勾选项 | `Checkbox` |
| 数值滑块 | `Slider` |
| 滚动面板 | `ScrollArea` |
| 状态标签 | `Badge` |
| 上传/导出进度 | `Progress` |
| 空截图列表 | `Empty` |
| 操作反馈 | `sonner` |
| 说明悬浮 | `Tooltip` |
| 侧栏布局 | `Sidebar` |
| 可拖拽/可调整面板 | `Resizable` |
| 命令式搜索/字体选择 | `Command` |
| 自定义字体管理 | `Dialog` + `Input` + `Button` + `Table` + `Badge` |
| 表格或结构化列表 | `Table` |

shadcn 使用注意：

- 所有可交互 UI 控件优先使用 shadcn/ui：按钮、输入、选择、开关、弹窗、菜单、Tabs、侧栏、空状态、进度、提示、命令搜索、可调整布局等。
- 不新建自绘控件库；确实需要业务封装时，封装组件内部仍然组合 shadcn primitives。
- 使用语义色，如 `bg-background`、`text-muted-foreground`、`border-border`。
- 用 `gap-*` 做布局间距，不使用 `space-x-*`/`space-y-*`。
- icon 放在 `Button` 内时使用 `data-icon`，不要手写尺寸类。
- 表单分组使用 shadcn 的 `Field`/`FieldGroup` 体系，不能用散落的原生 `label + input + div` 拼装。
- 不把页面 section 做成一层层卡片；编辑器应保持工具型、密集但清晰的工作台布局。

## Tailwind 迁移策略

1. 保留当前深色/浅色主题语义，映射为 shadcn CSS variables。
2. `migrate/src/app/globals.css` 只保留 Tailwind 引入、shadcn tokens、必要 base reset，不承接旧 `styles.css` 的大段选择器。
3. 旧 `styles.css` 中的布局、间距、颜色、边框、阴影、响应式规则全部迁移为 Tailwind className。
4. 不使用 CSS Modules、SCSS、LESS 或新增普通 CSS 文件。
5. 组件变体通过 shadcn 组件 variant、Tailwind utility、`cn()` 和语义 token 表达。
6. Canvas、预览区、固定比例控件必须使用 Tailwind 的响应式尺寸、`aspect-*`、`min-*`、`max-*`、grid/flex 约束，避免状态变化导致布局跳动。
7. 动态用户值，如颜色 swatch、渐变 stop 预览、Canvas 绘制参数，可以用 React style 或 Canvas API 表达；除这类运行时数值外，界面样式都应落在 Tailwind。
8. 大量重复的 slider 行、颜色 swatch、属性行抽成局部业务组件，但内部使用 shadcn 组件和 Tailwind className。

## Canvas 和 Three.js 迁移

Canvas 渲染建议保持命令式渲染核心：

```text
src/lib/canvas/renderer.ts
  renderScreenshotToCanvas(project, screenshotIndex, canvas, options)
  drawBackground(...)
  drawScreenshot(...)
  drawText(...)
  drawElements(...)
  drawPopouts(...)
```

React 组件负责：

- 用 `useRef<HTMLCanvasElement>` 获取 canvas。
- 用 `useEffect` 在项目状态变化后调用 renderer。
- 对频繁拖拽使用 ref 保存 transient state，避免每一帧都触发 React 重渲染。
- 导出时复用同一套 renderer 渲染到离屏 canvas。

Three.js 必须放在客户端动态加载：

```ts
const ThreeDevicePreview = dynamic(() => import("@/components/editor/three-device-preview"), {
  ssr: false,
})
```

GLB 模型迁移到 `public/models`，路径改为 `/models/iphone-15-pro-max.glb`。

## 自定义字体

新增自定义字体上传和选择能力，服务于 headline、subheadline 和文本元素。

### 存储

```text
data/fonts/
├── index.json                 # 字体元数据列表
└── <fontId>                   # 字体二进制文件，按 hash 命名
```

项目 JSON 不保存字体二进制，只保存字体引用：

```ts
type TextFontSelection =
  | { source: "system"; family: string }
  | { source: "google"; family: string }
  | { source: "custom"; id: string; family: string; url: string }
```

### 前端加载

- 应用启动时通过 `GET /api/fonts` 获取自定义字体列表。
- 上传成功后立即使用 `new FontFace(family, "url('/api/fonts/:id')")` 加载字体，并加入 `document.fonts`。
- Canvas 渲染和导出前调用 `ensureFontLoaded(fontSelection)`，保证 `ctx.font` 使用自定义字体时不会 fallback。
- 字体 family 需要做命名隔离，例如 `CustomFont_<id>` 作为内部 family，UI 显示原始名称，避免与系统字体或 Google Fonts 同名冲突。
- 字体加载失败时 TextPanel 显示错误状态，并禁止保存使用失败字体的新样式。

### UI

- TextPanel 的字体选择器合并三类来源：系统字体、Google Fonts、自定义字体。
- 自定义字体通过 `FontManagerDialog` 管理，使用 shadcn `Dialog`、`Input`、`Button`、`Table`、`Badge`、`Progress`、`sonner`。
- 上传入口接受 `.woff2,.woff,.ttf,.otf`。
- 字体列表显示名称、格式、上传时间、引用状态和删除操作。
- 字体预览文本使用对应字体实际渲染。

## AI 与 API Key

当前 API key 和 provider 选择保存在 `localStorage`。如果“完全依赖后端存储数据”只针对项目业务数据，则可以保留主题、活动 tab、AI provider/API key 这类用户本机偏好。

如果要求彻底不使用任何浏览器持久化，则需要新增后端用户偏好/密钥存储：

- `GET /api/preferences`
- `PUT /api/preferences`
- API key 服务端加密保存，前端不再读取明文本地 key。
- AI 翻译请求改为走后端代理，避免浏览器直接调用第三方 API。

推荐迁移目标是：项目和图片数据完全后端化；API key 是否后端化由部署安全要求单独决定。

## Tauri 不迁移

迁移后的产品只支持 Web/Docker 部署，不再支持 Tauri 桌面端。

处理要求：

- `src-tauri/` 不复制到 `migrate/`。
- `src/web/index.html` 中的 Tauri 检测、菜单事件、原生导入和外链打开逻辑不迁移。
- `scripts/copy-frontend.js` 不迁移。
- `package.json` 中的 `tauri`、`tauri:dev`、`tauri:build` 脚本不迁移。
- `@tauri-apps/cli` 不作为新项目依赖。
- 替换根目录时删除或归档 `src-tauri/`，并在 README 中说明新版不支持桌面端。

## Docker 迁移

`migrate/` 内建议使用 Next standalone 输出。迁移开发期如果从 `migrate/` 启动服务，服务端存储路径应指向根目录 `../data`；整体替换后再改回应用目录下的 `data`。

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
RUN mkdir -p /app/data/projects /app/data/images
RUN mkdir -p /app/data/fonts
EXPOSE 3000
CMD ["node", "server.js"]
```

`docker-compose.yml` 中继续挂载 `./data:/app/data`。

## 整体替换策略

`migrate/` 验收通过后再替换根目录，替换原则是“保留数据，替换实现”。

替换前必须确认：

- `migrate/` 内 `pnpm install --frozen-lockfile` 和 `pnpm run build` 通过。
- `migrate/` 的 API 能直接读取根目录 `data/projects`、`data/images` 和 `data/fonts`。
- `migrate/` 中搜索不到 IndexedDB 运行时依赖。
- 当前旧项目有可回滚分支或提交。

建议替换范围：

| 保留 | 替换/删除 |
| --- | --- |
| `.git/` | 旧 `src/web` |
| `data/` | 旧 `src/server` |
| `docs/` | 旧根 `package.json`、`package-lock.json`，替换为新 `package.json`、`pnpm-lock.yaml` |
| `uploads/` | 旧 `Dockerfile`、Compose、Next 相关配置按新项目覆盖 |
| `.env`、`.env.example` 按需合并 | 旧 `nginx.conf` 如果 Next standalone 不再需要则删除 |
| 需要保留的文档说明 | `src-tauri/`、Tauri 脚本和 `@tauri-apps/cli` |

替换过程不要使用会清空仓库的危险命令。推荐步骤：

```text
1. 在 git 中确认旧项目当前状态可回滚。
2. 备份根目录部署配置中仍需要保留的环境变量和端口设置。
3. 将 migrate/ 中的新项目文件复制到根目录。
4. 合并 docs、data、uploads，而不是覆盖删除。
5. 删除旧 src/web、src/server、sync-worker 等已被新项目替代的文件。
6. 删除或归档 `src-tauri/`，移除 Tauri 相关脚本和依赖。
7. 在根目录执行 `pnpm install --frozen-lockfile`、`pnpm run build`。
8. 启动新服务验证数据、图片、项目列表和导出。
9. 验收后删除 migrate/。
```

## 分阶段实施计划

### 阶段 0：冻结数据契约

- 在 `migrate/src/lib/project-schema.ts` 新增数据类型。
- 给现有项目 JSON 建立 TypeScript 类型。
- 写 `serializeProject()` 和 `hydrateProject()`，明确哪些字段可持久化、哪些只是运行时对象。
- 给当前 `data/projects/default/*.json` 做兼容性检查。

### 阶段 1：搭建 Next + Tailwind + shadcn

- 在 `migrate/` 初始化 Next App Router、TypeScript、Tailwind。
- 在 `migrate/` 使用 `pnpm` 初始化依赖，设置 `packageManager`，生成并提交 `pnpm-lock.yaml`。
- 在 `migrate/` 初始化 shadcn，添加所有需要的基础组件；后续新增控件也通过 `pnpm dlx shadcn@latest add ...` 引入。
- 将 `src/web/img` 和 `src/web/models` 迁移到 `migrate/public/`。
- 为开发环境配置 `DATA_DIR=../data`。
- 不迁移 `src-tauri/`、`scripts/copy-frontend.js`、Tauri 菜单动作和桌面端原生导入逻辑。
- 保留旧 `src/web` 作为参考，先不要删除。

### 阶段 2：迁移后端

- 将 `src/server/storage.js` 改写为 `migrate/src/lib/server/storage.ts`。
- 将 `auth.js` 改写为 `migrate/src/lib/server/auth.ts` 和 `migrate/src/middleware.ts`。
- 使用 Route Handlers 实现现有 API。
- 确认 `GET /api/projects`、`GET/PUT/DELETE /api/projects/:id`、图片 API 与现有数据目录兼容。
- 新增字体存储和 API：`GET /api/fonts`、`POST /api/fonts/upload`、`GET /api/fonts/:id`、`DELETE /api/fonts/:id`。
- 创建 `data/fonts`，实现字体 hash 去重、元数据索引、MIME/扩展名/大小校验。

### 阶段 3：建立 React 编辑器状态

- 以 `ProjectSnapshot` 为唯一编辑器状态来源。
- 用 `useReducer` 或拆分 context 管理编辑状态。
- `saveState()` 改为 `useAutosave()`，debounce 后直接 `PUT` 后端。
- 保存成功后以服务端返回版本更新内存状态。
- 项目切换前 flush 当前保存队列。
- 在编辑器状态中引入字体列表和字体加载状态；文本样式保存 `TextFontSelection`，不要只保存裸 `fontFamily` 字符串。

### 阶段 4：迁移核心渲染

- 把 `drawBackground*`、`drawScreenshot*`、`drawText*`、`drawElements*`、`drawPopouts*` 拆到 `src/lib/canvas`。
- `PreviewStage` 只通过 canvas ref 调用 renderer。
- 批量导出复用 renderer，保留 JSZip。
- Three.js 设备渲染通过客户端动态组件加载。
- Canvas 文本渲染前必须等待自定义字体加载完成；导出当前截图和批量导出都复用同一套字体加载逻辑。

### 阶段 5：组件化 UI

- 先迁移主三栏布局：项目侧栏、中心预览、右侧 inspector。
- 再迁移弹窗和面板：项目、语言、翻译、导出、设置。
- 最后迁移选择器：Google Fonts、emoji、icon、渐变 stops、颜色 swatch。
- 每个 UI 迁移项都必须落到 shadcn 组件或由 shadcn 组件组合出的业务组件；不能从旧 HTML/CSS 直接搬运自定义控件。
- 旧 `styles.css` 对应样式必须在本阶段逐项迁移成 Tailwind className，不能保留为兼容层。
- 新增 `FontManagerDialog` 和统一 `FontPicker`，支持上传自定义字体并在 Text 样式中选择。

### 阶段 6：移除 IndexedDB

- 在 `migrate/` 新实现中不引入任何 `indexedDB` 调用。
- 不迁移 `sync-worker.js` 和 worker 初始化。
- 删除 IndexedDB 导入导出备份格式。
- 搜索确认无残留：

```bash
rg -n "indexedDB|PROJECTS_STORE|META_STORE|openDatabase|sync-worker|remoteVersion" migrate/src
```

- 新项目导入导出改为后端格式。
- 图片上传失败时禁止保存，提示用户重试。

### 阶段 7：兼容旧用户数据

有两种迁移方式，二选一：

1. 发布前要求用户在旧版本导出备份 JSON，新版本通过后端导入接口导入。
2. 做一个一次性 legacy migration 页面：只在迁移版本中读取旧 IndexedDB，上传到后端，成功后调用 `indexedDB.deleteDatabase("AppStoreScreenshotGenerator")`。最终正式版本删除这段代码。

最终版本不得依赖 IndexedDB。

### 阶段 8：验证

- 在 `migrate/` 中执行 `pnpm install --frozen-lockfile`
- 在 `migrate/` 中执行 `pnpm run lint`
- 在 `migrate/` 中执行 `pnpm run build`
- API 路由单测或脚本验证项目 CRUD、图片上传、鉴权。
- API 路由单测或脚本验证字体上传、字体列表、字体读取、字体删除约束。
- Playwright 验证桌面和移动宽度下的编辑器布局、上传、保存、切换项目、导出。
- Canvas 像素级烟测：上传图片后主画布非空、切换尺寸后画布尺寸正确、导出 PNG 可打开。
- 字体烟测：上传 `.woff2` 字体后，TextPanel 可选择该字体；主画布和导出 PNG 都使用该字体渲染。
- 搜索确认项目 JSON 中不含 `data:` 图片引用。
- 搜索确认项目 JSON 中不含字体 base64。
- 搜索确认没有旧 CSS 兼容层：

```bash
rg -n "styles\\.css|\\.module\\.css|\\.scss|\\.less" migrate
```

### 阶段 9：整体替换

- 停止旧服务。
- 将 `migrate/` 的新项目文件合并到仓库根目录。
- 保留根目录 `data/`，不迁移、不清空、不重建。
- 合并 `docs/` 的必要改动。
- 删除旧 `src/web`、`src/server` 和旧同步链路。
- 删除或归档 `src-tauri/`，确认新版本不提供 Tauri 桌面端。
- 根目录执行 `pnpm install --frozen-lockfile`、`pnpm run build`、启动验证。
- 验收后删除 `migrate/`。

## 迁移验收标准

- 首页由 Next.js 渲染，编辑器首屏可用。
- `src/web/index.html` 不再作为运行入口。
- `src/web/app.js` 被 React 组件和 `src/lib/*` 模块替代。
- `src/web/sync-worker.js` 删除。
- `src-tauri/` 不进入新项目，迁移后不支持 Tauri 桌面端。
- `package.json` 中没有 `tauri`、`tauri:dev`、`tauri:build` 脚本，也没有 `@tauri-apps/cli` 依赖。
- 新项目使用 `pnpm`，根目录替换后存在 `pnpm-lock.yaml`，不存在 `package-lock.json`。
- 通用 UI 控件全部来自 shadcn/ui 或 shadcn primitives 的业务封装。
- 旧 `styles.css` 不再运行；组件样式全部迁移为 Tailwind className 和 shadcn tokens。
- 运行时不再调用 `indexedDB`。
- 刷新页面后项目数据来自后端。
- 换浏览器或清浏览器缓存后，登录同一实例仍能看到后端项目列表。
- 上传图片后项目 JSON 只保存 `/api/images/:id` 引用。
- 上传自定义字体后，字体文件保存到后端 `data/fonts`，项目 JSON 只保存 `/api/fonts/:id` 引用和字体元数据。
- Text 样式可选择自定义字体，预览画布和导出结果都能使用该字体。
- 创建、重命名、删除、复制项目都直接落后端。
- 项目导入导出不依赖 IndexedDB dump。
- Docker 部署后 `data/` 挂载仍然可用。

## 风险点

- `app.js` 逻辑体量大，建议先搬运纯函数和数据模型，再拆 React UI，不要一次性重写全部交互。
- 当前有多个上传失败回退到 `data:` 的入口，移除 IndexedDB 后必须统一改成保存前强制上传成功。
- 多标签页编辑同一项目时需要版本冲突处理，否则后保存的标签页会覆盖先保存的数据。
- 自定义字体需要处理授权、文件大小、格式校验和加载失败 fallback；导出前尤其要等待字体加载完成。
- Tauri 支持被移除后，原生文件导入和桌面菜单能力需要从新版 README 中明确标记为不再支持。
- AI API key 是否继续存在浏览器本地，需要单独确认安全策略。

## 推荐迁移顺序清单

1. 在 `migrate/` 用 `pnpm` 新建 Next 工程基础文件和 shadcn 配置。
2. 配置 `migrate/` 开发时读取根目录 `../data`。
3. 迁移后端 Route Handlers，保持 `data/` 格式不变。
4. 抽出项目 schema、serializer、hydrator。
5. 抽出 Canvas renderer。
6. 搭建 React 三栏编辑器壳。
7. 用 shadcn 组件迁移所有通用 UI 控件。
8. 将旧 `styles.css` 全部迁移为 Tailwind className 和 shadcn tokens。
9. 接入项目列表、项目读取、后端 autosave。
10. 新增自定义字体后端 API、`FontManagerDialog` 和 `FontPicker`。
11. 迁移上传和图片引用策略，禁止持久化 `data:`。
12. 迁移各设置面板和弹窗。
13. 确认 `migrate/` 中没有 IndexedDB、sync worker 和旧 CSS 兼容层。
14. 跑完整验证并更新 README、Docker 文档，注明新版不支持 Tauri。
15. 验收通过后用 `migrate/` 整体替换旧项目。
