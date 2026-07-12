# Artist Prefetch and Session Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** OCR 提交演出信息后，立即并行查询 QQ 音乐歌手信息和热门前 10 首，并把标准化结果缓存在当前前端会话中，不阻塞用户进入素材页。

**Architecture:** 扩展现有 QQ 音乐底层请求与标准化模块，新增一个只负责预取编排和静默降级的小模块，再通过独立 API Route 暴露给前端。`page.tsx` 只持有会话缓存并触发异步预取，不处理签名、供应商响应或降级选择。

**Tech Stack:** Next.js 16 App Router、TypeScript、Node test runner、现有 HMAC-SHA256 QQ 音乐适配层。

## Global Constraints

- 真实 API Key 只从服务端环境变量读取，不进入浏览器包、日志或测试快照。
- OCR 完成后立即开始预取，但不得阻塞页面从票根页进入素材页。
- 歌手查询与热门搜索使用 `Promise.allSettled` 并行执行。
- QQ 音乐无权限、超时、空响应或协议差异时返回本地同艺人/本地热门曲降级，不向用户展示技术失败。
- 只实现本单元需要的歌手确认、热门曲预取和会话缓存，不提前实现识曲、相似歌曲或 `music_skill`。
- 当前目录不是 Git 仓库，计划中的提交步骤记录建议提交内容，但执行时跳过实际提交。

---

### Task 1: QQ Music singer lookup adapter

**Files:**
- Modify: `src/lib/musicRecommendation.ts`
- Modify: `src/lib/musicRecommendation.test.mjs`

**Interfaces:**
- Consumes: `QQMusicConfig`、现有签名规则和 `MusicTrack` 标准化。
- Produces: `MusicSinger { mid: string; name: string }` 和 `queryQQMusicSinger(artist, config): Promise<MusicSinger | null>`。

- [ ] **Step 1: Write the failing request/normalization test**

在 `musicRecommendation.test.mjs` 增加测试，注入 `fetcher`，返回包含 `singer_mid`、`singer_name` 的歌手列表，并断言：

```js
test('queries QQ Music singer list and normalizes singer_mid', async () => {
  const calls = [];
  const singer = await queryQQMusicSinger('周杰伦', {
    appId: 'app-id',
    appKey: 'app-key',
    baseUrl: 'https://music.example.test/api',
    fetcher: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        async json() {
          return { ret: 0, data: { singer_list: [{ singer_mid: '0025NhlN2yWrP4', singer_name: '周杰伦' }] } };
        },
      };
    },
  });

  assert.deepEqual(singer, { mid: '0025NhlN2yWrP4', name: '周杰伦' });
  assert.match(calls[0].url, /opi_cmd=fcg_music_custom_query_singer_list\.fcg/);
  assert.match(calls[0].url, /singer_name=%E5%91%A8%E6%9D%B0%E4%BC%A6/);
  assert.ok(calls[0].init.headers['X-QYOPI-Sign']);
});
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run:

```bash
node --experimental-strip-types --test src/lib/musicRecommendation.test.mjs
```

Expected: FAIL because `queryQQMusicSinger` is not exported.

- [ ] **Step 3: Implement the minimal singer request**

在 `musicRecommendation.ts` 中复用公共鉴权参数和签名函数，构造：

```ts
export interface MusicSinger {
  mid: string
  name: string
}

export async function queryQQMusicSinger(
  artist: string,
  config: QQMusicConfig = {}
): Promise<MusicSinger | null> {
  if (!hasQQMusicConfig(config) || !artist.trim()) return null
  // opi_cmd=fcg_music_custom_query_singer_list.fcg
  // singer_name=<artist>, page=1, num=10
  // validate ret === 0, then normalize the first exact-name match,
  // falling back to the first valid singer item.
}
```

抽取 `buildQQMusicBaseParams(opiCmd, config)`，让搜索和歌手查询共享 `app_id/timestamp/login_type/device_id` 及可选登录参数，避免复制签名逻辑。

- [ ] **Step 4: Add empty/error response tests**

增加两项测试：`singer_list: []` 返回 `null`；`ret !== 0` 抛出包含 `ret/sub_ret/msg` 的错误。不得吞掉适配器错误，降级由下一任务的编排器负责。

- [ ] **Step 5: Run adapter tests and verify GREEN**

Run the same targeted test command. Expected: all `musicRecommendation` tests pass.

- [ ] **Step 6: Record suggested commit**

Suggested commit: `feat: add qq music singer lookup adapter`（当前无 Git 仓库，执行时只记录到 `progress.md`）。

---

### Task 2: Artist prefetch orchestration and silent fallback

**Files:**
- Create: `src/lib/artistPrefetch.ts`
- Create: `src/lib/artistPrefetch.test.mjs`

**Interfaces:**
- Consumes: `queryQQMusicSinger`、`searchQQMusicSongs`、`MusicTrack`、`QQMusicConfig`。
- Produces:

```ts
export interface ArtistPrefetchResult {
  artist: string
  singerMid: string | null
  topTracks: MusicTrack[]
  source: 'qq-music' | 'fallback'
  ready: true
}

export async function prefetchArtistCatalog(
  artist: string,
  config: QQMusicConfig = {},
  dependencies?: ArtistPrefetchDependencies
): Promise<ArtistPrefetchResult>
```

- [ ] **Step 1: Write a failing parallel-success test**

用两个 deferred Promise 注入 `querySinger` 和 `searchSongs`；调用 `prefetchArtistCatalog` 后，在 resolve 前断言两者都已启动。随后 resolve 并断言结果只保留前 10 首、`source === 'qq-music'`、`ready === true`。

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
node --experimental-strip-types --test src/lib/artistPrefetch.test.mjs
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement minimal all-settled orchestration**

实现结构：

```ts
const [singerResult, tracksResult] = await Promise.allSettled([
  querySinger(artist, config),
  searchSongs(artist, config),
])
```

歌曲成功且非空时返回 QQ 结果；否则从现有本地歌曲库选择同艺人歌曲，再补足最多 10 首。`source` 仅在真实搜索返回至少一首时为 `qq-music`。歌手查询失败不影响歌曲结果。

- [ ] **Step 4: Add fallback and deduplication tests**

覆盖：歌手失败但搜索成功；搜索失败但歌手成功；两者失败；搜索返回重复 ID/歌名时去重；待确认艺人直接返回本地 fallback，且不调用外部依赖。

- [ ] **Step 5: Run orchestration tests and verify GREEN**

Run targeted tests. Expected: all pass with no unhandled rejection.

- [ ] **Step 6: Record suggested commit**

Suggested commit: `feat: prefetch artist catalog with silent fallback`。

---

### Task 3: Server-only artist prefetch API

**Files:**
- Create: `src/app/api/prefetch-artist/route.ts`
- Modify: `src/lib/artistPrefetch.test.mjs`

**Interfaces:**
- Consumes request: `{ artist?: string }`。
- Produces response: `ArtistPrefetchResult`；缺少有效 artist 时返回 HTTP 400 `{ error: 'artist is required.' }`。

- [ ] **Step 1: Add route-contract tests around the pure handler input policy**

把输入校验提取为 `normalizeArtistPrefetchInput(value: unknown): string | null` 并测试空字符串、`待确认艺人`、非字符串返回 `null`，有效艺人去除首尾空白。

- [ ] **Step 2: Run tests and verify RED**

Expected: FAIL because input normalization is missing.

- [ ] **Step 3: Implement the API Route**

Route 读取服务器环境变量：

```ts
const result = await prefetchArtistCatalog(artist, {
  appId: process.env.QQ_MUSIC_APP_ID,
  appKey: process.env.QQ_MUSIC_APP_KEY,
  baseUrl: process.env.QQ_MUSIC_BASE_URL,
  openAppId: process.env.QQ_MUSIC_OPEN_APP_ID,
  openId: process.env.QQ_MUSIC_OPEN_ID,
  accessToken: process.env.QQ_MUSIC_ACCESS_TOKEN,
  deviceId: process.env.QQ_MUSIC_DEVICE_ID,
  clientIp: process.env.QQ_MUSIC_CLIENT_IP,
  loginType: process.env.QQ_MUSIC_LOGIN_TYPE,
})
```

供应商失败不返回 500，因为编排器已生成 fallback；只有无效 JSON/输入返回 400。

- [ ] **Step 4: Run artist prefetch and full library tests**

Run:

```bash
node --experimental-strip-types --test src/lib/artistPrefetch.test.mjs src/lib/musicRecommendation.test.mjs
```

Expected: all pass.

- [ ] **Step 5: Record suggested commit**

Suggested commit: `feat: expose server-side artist prefetch endpoint`。

---

### Task 4: Non-blocking current-session cache integration

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/lib/artistPrefetch.test.mjs`

**Interfaces:**
- Consumes: `POST /api/prefetch-artist` and `ArtistPrefetchResult` type.
- Produces: `artistCatalog` state available to later recognition/radio tasks; this task does not render new UI.

- [ ] **Step 1: Add a pure session-state reducer test**

在 `artistPrefetch.ts` 导出：

```ts
export interface ArtistCatalogSessionState {
  status: 'idle' | 'loading' | 'ready'
  requestArtist: string
  result: ArtistPrefetchResult | null
}

export function startArtistPrefetch(artist: string): ArtistCatalogSessionState
export function finishArtistPrefetch(
  state: ArtistCatalogSessionState,
  result: ArtistPrefetchResult
): ArtistCatalogSessionState
```

测试旧艺人请求晚于新请求返回时，`finishArtistPrefetch` 忽略过期结果，防止快速修改票根导致缓存串线。

- [ ] **Step 2: Run reducer test and verify RED**

Expected: FAIL because reducer functions do not exist.

- [ ] **Step 3: Implement the reducer and integrate `page.tsx`**

`handleConcertSubmit` 保持同步跳页，然后无等待触发：

```ts
setArtistCatalog(startArtistPrefetch(info.artist))
void postJson<ArtistPrefetchResult>('/api/prefetch-artist', { artist: info.artist })
  .then((result) => setArtistCatalog((state) => finishArtistPrefetch(state, result)))
  .catch(() => {
    // Leave loading state; later radio orchestration owns the local fallback.
  })
```

不得在 `await` 之后调用 `goToNextPage()`；用户提交票根后应立即进入素材页。添加 unmount/request version 防护，避免页面卸载后无意义更新。

- [ ] **Step 4: Run reducer, adapter and all unit tests**

Run:

```bash
pnpm run test
```

Expected: all tests pass.

- [ ] **Step 5: Run production build**

Run:

```bash
pnpm run build
```

Expected: TypeScript and Next.js build complete successfully.

- [ ] **Step 6: Perform one live API smoke test without printing credentials**

POST `{ "artist": "周杰伦" }` to `/api/prefetch-artist` and record only HTTP status、`source`、`singerMid` 是否存在、`topTracks.length`。不得打印请求签名、App Key 或完整供应商错误响应。

- [ ] **Step 7: Update persistent planning files**

把该单元完成状态、测试结果、真实 QQ 调用是否成功写入 `progress.md` 和 `findings.md`；若供应商回退，明确记录“适配器与降级通过，真实歌手接口未验证”。

- [ ] **Step 8: Record suggested commit**

Suggested commit: `feat: prefetch artist catalog after ticket OCR`。
