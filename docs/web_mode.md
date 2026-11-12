# 浏览器版（Web 模式）

同一份前端源码可以在普通浏览器中运行，同时保持桌面端（Tauri）构建不变。

## 平台抽象层

平台接口和实现位于 `src/platform/`：

- `src/platform/types.ts`：定义 `PlatformAdapter`、`PlatformCapabilities`、`WindowService` 等接口。
- `src/platform/index.ts`：业务代码访问平台的唯一入口，通过 `import { getPlatform } from '@/platform'` 获取当前适配器。
- `src/platform/adapter.ts`：Tauri 构建的适配器入口，运行时根据 `isMobile()` 选择 desktop 或 mobile 实现。
- `src/platform/desktop/`：桌面端适配器与原生窗口实现。
- `src/platform/mobile/`：移动端适配器，不支持子窗口，窗口创建返回 `null`。
- `src/platform/web/`：浏览器实现；web 构建通过 `build/config/webAlias.ts` 将 `@/platform/adapter` 替换为 `src/platform/web/adapter.ts`。

业务代码通过 `getPlatform().capabilities` 判断能力，当前四个字段的取值如下：

| 字段 | 含义 | 桌面端 | 移动端 | 浏览器端 |
| :--- | :--- | :--- | :--- | :--- |
| `windowControls` | 系统窗口按钮（置顶、最小化、最大化、关闭）及 macOS 交通灯 | `true` | `false` | `false` |
| `screenshot` | 聊天输入栏截图工具 | `true` | `false` | `false` |
| `childWindow` | 子窗口展示方式 | `'native'`（原生窗口） | `'none'`（不支持） | `'dialog'`（页内弹窗） |
| `websocketStateEvents` | 通过 `websocket-event` 事件报告聊天 WebSocket 连接状态 | `true` | `true` | `true` |

打开子窗口仍调用 `src/hooks/useWindow.ts` 中 `useWindow()` 提供的 `createWebviewWindow` / `createModalWindow`。label 规范化、路由与查询参数拼接等公共逻辑放在 `useWindow` 中，平台差异由 `getPlatform().windows` 的 `open` / `openModal` 实现处理。

新增平台差异时，先在 `PlatformCapabilities` 中增加能力字段，再分别在 `src/platform/desktop/index.ts`、`src/platform/mobile/index.ts` 和 `src/platform/web/adapter.ts` 中赋值；业务代码读取能力字段，不直接判断 `isWeb`。

## 原理

- `vite --mode web` 时，`build/config/webAlias.ts` 把已支持的 `@tauri-apps/*` 模块与 `tauri-plugin-mic-recorder-api` 精确别名到 `src/platform/web/tauri/` 下的浏览器实现；Tauri 构建不加载这些浏览器替换别名。
- Rust 命令（`invoke`）在 `src/platform/web/commands/` 中实现：HTTP 请求、WebSocket、会话/消息查询、上传、AI 流式输出等直接访问服务端，返回与 Rust 命令相同的数据结构。
- `src/platform/web/commands/imUrls.ts` 由 `node scripts/gen-web-im-urls.mjs` 从 `src-tauri/src/im_request_client.rs` 生成，修改 Rust 中的接口地址后需要重新生成。
- 登录页和主页是页面本身，在当前标签页中切换；其余窗口（设置、聊天记录等）通过 `src/platform/web/windowHost/` 在顶层页面中显示为可拖动弹窗。弹窗内容是以窗口 label 命名的同源 iframe，模态窗口带遮罩，标题栏提供关闭按钮；iframe 内再打开的窗口也添加到顶层页面。窗口间事件仍通过 BroadcastChannel 传递。
- WebSocket 在 `src/platform/web/commands/ws.ts` 中由调用 `ws_init_connection` 的页面创建并持有，并非固定归属于主页：登录流程可在登录页建立连接，切换到主页后由主页初始化自己的连接。子窗口发送消息时通过 BroadcastChannel 转交给持有连接的页面，并读取共享连接状态。
- 文件读写使用内存中的虚拟文件系统：选择/拖入的文件可直接上传，"另存为"会触发浏览器下载，刷新页面后缓存文件清空。
- 业务代码需要处理平台差异时，使用上文“平台抽象层”中的能力判断和窗口服务。
- web 模式下若引入了没有浏览器实现的 Tauri 模块，构建会直接报错，需在 `build/config/webAlias.ts` 中补充。

## 使用

```bash
pnpm dev:web       # 开发服务器，默认 http://127.0.0.1:6131
pnpm build:web     # 打包到 dist-web
pnpm preview:web   # 预览 dist-web
```

后端地址在 `.env.web` 中配置（可用 `.env.web.local` 覆盖）：

| 变量 | 说明 |
| :--- | :--- |
| `VITE_WEB_API_BASE` | 浏览器请求的同源路径，默认 `/api` |
| `WEB_API_TARGET` | 开发/预览服务器把 `/api` 代理到的后端地址，默认 `http://127.0.0.1:18760` |
| `WEB_API_STRIP_PREFIX` | 是否去掉 `/api` 前缀再转发。HuLa-Server 网关为 `true`；服务端自身以 `/api` 开头时设为 `false` |
| `WEB_PORT` | 开发/预览端口，默认 6131（桌面端开发占用 6130，可同时运行；web 模式使用独立的依赖缓存 `node_modules/.vite-web`，两者互不干扰） |

生产部署时把 `dist-web` 交给 Nginx 等静态服务器，并把 `/api`（含 WebSocket 升级）反向代理到网关。

### 测试

运行 `pnpm test:run` 执行单元测试，浏览器版相关测试位于 `src/platform/__tests__` 和 `src/platform/web/__tests__`。

## 与桌面端的差异

- 没有托盘、全局快捷键、开机自启、截图、自动更新、嵌入式网页。
- 不显示系统窗口按钮（置顶、最小化、最大化、关闭）和 macOS 交通灯，子窗口以页内弹窗代替独立窗口。
- 第三方登录回调回到当前站点（`?secret=...`），需要服务端允许该回调地址。一次性 secret 只保存在发起登录的页面内存中，回调页通过 BroadcastChannel 将回调数据交给发起页校验；校验成功后，回调页提示登录成功并自动关闭。因此，发起登录的页面在回调完成前不能刷新或关闭。
- 七牛分片上传依赖 Rust，浏览器版请使用 MinIO 存储。
- 读取剪贴板图片不可用（Ctrl+V 粘贴图片不受影响）。
- 自动化测试时可设置 `localStorage.__web_fake_media = '1'`，用生成的音视频代替摄像头和麦克风。
