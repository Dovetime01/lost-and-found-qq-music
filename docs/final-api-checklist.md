# Final API Checklist

最后接入 API 时，按这个顺序做，避免一次性改太多。

## 1. 视觉 API：票根和媒体识别

目标：上传票根图片后，自动识别演出名、歌手、日期、城市和场馆；上传图片/视频首帧后，生成现场氛围描述。

- 票根识别在 `.env.local` 填入 `BAIDU_OCR_API_KEY`、`BAIDU_OCR_SECRET_KEY`、`TICKET_ARK_API_KEY`、`TICKET_ARK_BASE_URL`、`TICKET_ARK_MODEL`。
- 票根流程使用百度 `accurate_basic` OCR，再调用豆包 Ark `/responses` 提取结构化演唱会信息。
- `VISION_API_KEY`、`VISION_BASE_URL`、`VISION_MODEL` 仅用于图片与视频首帧证据分析。
- 确认模型支持视觉理解。
- 测试 `POST /api/extract-concert-info`。
- 测试 `POST /api/analyze-evidence`。

## 2. LLM API：记忆和情绪分析

目标：让失物认领单和歌单完全由 AI 根据用户输入生成。

- 在 `.env.local` 填入 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`。
- 记忆分析模型需支持 OpenAI-compatible `/chat/completions`；票根模型固定使用 Ark `/responses`。
- 测试 `POST /api/analyze-memory`。
- 验证蔡依林、周杰伦、Taylor Swift 等非五月天输入能生成对应的情绪标签、失物认领单和音乐搜索关键词。

对应文档：[docs/ai-analysis-contract.md](docs/ai-analysis-contract.md)

## 3. QQ 音乐 API：真实曲库推荐

目标：根据 LLM 输出的艺人、情绪标签和关键词，从 QQ 音乐曲库里返回真实歌曲。

- 在 `.env.local` 填入 `QQ_MUSIC_APP_ID`、`QQ_MUSIC_APP_KEY`、`QQ_MUSIC_BASE_URL`。
- `QQ_MUSIC_BASE_URL` 使用 `https://qplaycloud.y.qq.com/rpc_proxy/fcgi-bin/music_open_api.fcg`。
- 当前适配层使用 `fcg_music_custom_search.fcg`，服务端按文档生成 `X-QYOPI-Sign`。
- 如果权限包要求登录态，再补 `QQ_MUSIC_OPEN_APP_ID`、`QQ_MUSIC_OPEN_ID`、`QQ_MUSIC_ACCESS_TOKEN`、`QQ_MUSIC_DEVICE_ID`、`QQ_MUSIC_CLIENT_IP`。
- 未配置或接口失败时，自动回退本地曲库。

## 4. Supabase 失物墙

目标：匿名失物墙真实发布和真实读取。

- 创建 Supabase 项目。
- 执行 [docs/supabase-public-wall.sql](docs/supabase-public-wall.sql)。
- 在 `.env.local` 填入 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY`。
- 测试播放页归档后，失物墙第一条是否来自数据库。

## 5. 最终验收

```bash
pnpm run verify
```

手动验收：

- 空输入可以完整跑完，不崩溃。
- 上传图片后能生成氛围描述。
- 上传视频后能使用首帧生成氛围描述。
- 上传音频后能生成音频情绪描述。
- 输入不同歌手后，推荐不被固定在单一歌手。
- 点击收进失物柜后，刷新页面仍能恢复记录。
- Supabase 配置后，匿名失物墙能真实发布和读取。
