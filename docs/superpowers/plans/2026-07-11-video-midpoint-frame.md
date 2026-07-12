# Video Midpoint Frame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 视频上传后从 50% 时长位置截取一帧，并以 JPEG 质量 0.8 输出，失败时保持现有 `null` 降级。

**Architecture:** 把时间点选择和 JPEG 质量常量提取到无 DOM 的小工具中，用 Node 单测锁定规则；组件仍负责 `<video> + <canvas>` 生命周期，只调用该工具，避免为浏览器事件编写脆弱 mock。

**Tech Stack:** TypeScript、React、HTMLVideoElement、Canvas、Node test runner。

## Global Constraints

- 抽帧位置必须位于方案规定的 40%-60% 区间，固定采用 50%。
- JPEG 质量固定为 0.8。
- 非有限、零或负时长使用 0.1 秒安全回退；任何解码、seek 或 canvas 失败返回 `null`。
- 不修改音频处理，不新增依赖。

---

### Task 1: Pure frame selection policy and component integration

**Files:**
- Create: `src/lib/videoFrame.ts`
- Create: `src/lib/videoFrame.test.mjs`
- Modify: `src/components/EvidenceCollection.tsx`

**Interfaces:**
- Produces `selectVideoFrameTime(durationSeconds: number): number`。
- Produces `VIDEO_FRAME_JPEG_QUALITY = 0.8`。

- [ ] **Step 1: Write failing tests**

```js
test('selects the midpoint of a video', () => {
  assert.equal(selectVideoFrameTime(120), 60);
  assert.equal(selectVideoFrameTime(9), 4.5);
});

test('uses a safe fallback for invalid duration', () => {
  assert.equal(selectVideoFrameTime(0), 0.1);
  assert.equal(selectVideoFrameTime(Number.NaN), 0.1);
});

test('exports the required JPEG quality', () => {
  assert.equal(VIDEO_FRAME_JPEG_QUALITY, 0.8);
});
```

- [ ] **Step 2: Run RED**

Run `node --experimental-strip-types --test src/lib/videoFrame.test.mjs`。Expected: assertions fail because exports do not exist.

- [ ] **Step 3: Implement minimal policy**

```ts
export const VIDEO_FRAME_JPEG_QUALITY = 0.8

export function selectVideoFrameTime(durationSeconds: number) {
  return Number.isFinite(durationSeconds) && durationSeconds > 0
    ? durationSeconds * 0.5
    : 0.1
}
```

- [ ] **Step 4: Run GREEN**

Run the targeted test. Expected: 3 tests pass.

- [ ] **Step 5: Integrate component**

把 `captureVideoFirstFrame` 重命名为 `captureVideoMidpointFrame`；在 `onloadedmetadata` 中设置 `video.currentTime = selectVideoFrameTime(video.duration)`；使用 `canvas.toDataURL('image/jpeg', VIDEO_FRAME_JPEG_QUALITY)`。保留既有 cleanup 和 `null` 回退。

- [ ] **Step 6: Verify**

运行全量测试与生产构建。静态搜索确认不再存在 `Math.min(0.1, video.duration || 0)` 或 JPEG `0.82`。

- [ ] **Step 7: Record checkpoint**

更新 `progress.md` 和 `findings.md`。建议提交：`fix: capture video evidence from midpoint`（当前无 Git 仓库，不实际提交）。
