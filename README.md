# 失物招领处

面向现场音乐记忆的「归途失物招领」体验。基于 Next.js。

## 环境

- Node.js 20 或以上
- 本机可用的包管理器：优先使用项目自带的 pnpm（见下方）
- Python 3.8+（用于安装 ACRCloud 识曲 SDK）

不需要单独安装系统 FFmpeg，安装依赖时会带上 `ffmpeg-static`。

## 本地运行

在项目根目录按顺序执行：

### 1. 安装依赖

```bash
corepack enable
corepack prepare pnpm@11.12.0 --activate
pnpm install
```

若 `corepack` / `pnpm` 不可用，改用：

```bash
npx pnpm@11.12.0 install
```

### 2. 配置环境变量

```bash
# macOS / Linux
cp .env.local.example .env.local

# Windows PowerShell
Copy-Item .env.local.example .env.local
```

打开 `.env.local`，按 [`.env.local.example`](.env.local.example) 填入密钥。  
完整演示需要票根识别、多模态分析、QQ 音乐、ACRCloud、失物墙等配置项。  
**不要把 `.env.local` 提交到公开仓库。**

### 3. 安装 ACRCloud SDK

```bash
pnpm setup:acrcloud
```

### 4. 启动

开发模式：

```bash
pnpm dev
```

生产模式：

```bash
pnpm build
pnpm start
```

浏览器打开：http://localhost:3000

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 开发启动 |
| `pnpm build` | 生产构建 |
| `pnpm start` | 生产启动 |
| `pnpm test` | 单元测试 |
| `pnpm typecheck` | 类型检查 |
| `pnpm lint` | 代码检查 |
| `pnpm verify` | 测试 + lint + 构建 |
| `pnpm setup:acrcloud` | 安装 ACRCloud Python SDK |

## 关于播放与 VIP 提示

听歌页与电台页若出现「当前账号暂无该歌曲 VIP 完整播放权益，现可试听 1 分钟」，通常不是因为前端误判账号身份，而是 **QQ 音乐 OpenAPI 对当前应用/曲目只返回了试听链接**（`try_30s_url`），未返回完整播放地址（`song_play_url`）。

因此在本演示环境下，**多数歌曲都会显示上述 VIP 无权益提示**，实际可播放的是约 1 分钟的试听片段。完整播放取决于开放平台是否为应用开通播放权限，以及接口是否对该曲目返回完整 URL；这与用户在 QQ 音乐 App 内是否为 VIP 会员并不完全等同。
