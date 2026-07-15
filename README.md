# 失物招领处

![失物招领处](./public/static/coverpage.jpg)

面向现场音乐记忆的「归途失物招领」体验。

URL：[https://lost-and-found-qq-music.vercel.app/](https://lost-and-found-qq-music.vercel.app/)

> 访问提示：网站部署于 Vercel。部分网络环境下可能无法直接打开，如遇访问失败，请尝试使用 VPN 或代理网络后重新访问。

## 荣誉与团队

本项目获得 **腾讯音乐 AI Hackathon 2026 二等奖**。

团队来自 [宁波诺丁汉大学](https://www.nottingham.edu.cn/) 乐队俱乐部，成员：

1. [王艺勤](https://github.com/QQB2004)
2. [王亮立](https://github.com/Dovetime01)
3. [靳雨泽](https://github.com/rainjin-moon)

## 环境

- Node.js 20 或以上
- 本机可用的包管理器：优先使用项目自带的 pnpm（见下方）

不需要单独安装系统 FFmpeg，安装依赖时会带上 `ffmpeg-static`。  
ACRCloud 识曲走服务端 HTTP Identify API，**不需要**本机 Python。

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
上线 Vercel 时只配置 `ACRCLOUD_HOST` / `ACRCLOUD_ACCESS_KEY` / `ACRCLOUD_ACCESS_SECRET`（及可选 `ACRCLOUD_PROTOCOL`），**不要**配置本机 `ACRCLOUD_PYTHON_PATH`。  
识曲接口依赖 `ffmpeg-static`，已在 `next.config.js` / `vercel.json` 中为 Serverless 打包与加长超时。  
注意：Vercel Serverless 请求体默认约 **4.5MB**，过大的现场视频会在进到业务逻辑前失败。

### 3. 启动

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

## 示例测试素材

仓库内 [`sample/`](sample/) 提供两套可直接用于本地联调 / 体验的演示文件，按艺人分目录：

| 目录 | 适用艺人 | 包含文件 |
| --- | --- | --- |
| [`sample/李荣浩/`](sample/ChineseFootball/) | 李荣浩 | 票根、现场照片、视频、录音、文字歌词 |
| [`sample/陈粒/`](sample/陈粒/) | 陈粒 | 票根、现场照片、视频、录音、文字歌词 |

测试时按流程上传对应素材即可（票根 OCR、现场影像 / 录音识曲、情绪认领等）。文件仅作演示用途，请勿用于生产或对外分发。

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

## 关于播放与 VIP 提示

听歌页与电台页若出现「当前账号暂无该歌曲 VIP 完整播放权益，现可试听 1 分钟」，通常不是因为前端误判账号身份，而是 **QQ 音乐 OpenAPI 对当前应用/曲目只返回了试听链接**（`try_30s_url`），未返回完整播放地址（`song_play_url`）。

因此在本演示环境下，**多数歌曲都会显示上述 VIP 无权益提示**，实际可播放的是约 1 分钟的试听片段。完整播放取决于开放平台是否为应用开通播放权限，以及接口是否对该曲目返回完整 URL；这与用户在 QQ 音乐 App 内是否为 VIP 会员并不完全等同。

**演示建议：** 推荐使用 `sample/示例1-李荣浩` 作为示例素材。陈粒的不少曲目 OpenAPI 连试听链接（`try_30s_url`）都不返回，听歌/电台页会无法播放；李荣浩相关曲目通常仍能拿到试听 URL，更适合现场演示。登录页可直接下载完整 `sample` 示例包。
