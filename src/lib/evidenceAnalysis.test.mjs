import test from 'node:test';
import assert from 'node:assert/strict';

const {
  analyzeEvidenceArtifacts,
} = await import('./evidenceAnalysis.ts');

const artifacts = [
  {
    id: 'photo',
    type: 'image',
    sourceType: 'photo',
    label: '照片',
    content: 'stage.jpg',
    previewUrl: 'data:image/jpeg;base64,photo',
    extractedText: '用户上传了照片线索：stage.jpg。',
  },
  {
    id: 'video',
    type: 'video',
    sourceType: 'video',
    label: '视频',
    content: 'chorus.mp4',
    previewUrl: 'data:video/mp4;base64,video',
    visualFrameDataUrl: 'data:image/jpeg;base64,frame',
    extractedText: '用户上传了视频线索：chorus.mp4。视频首帧将作为视觉理解输入。',
  },
  {
    id: 'audio',
    type: 'audio',
    sourceType: 'audio',
    label: '声音',
    content: 'singalong.m4a',
    audioFeatures: {
      averageVolume: 0.8,
      peakVolume: 0.95,
      estimatedPitchHz: 392,
      durationSeconds: 30,
    },
    extractedText: '用户上传了音频线索：singalong.m4a。浏览器音频特征：音量很高，峰值接近爆发，音高偏高，片段约 30 秒。',
  },
  {
    id: 'note',
    type: 'text',
    sourceType: 'note',
    label: '一句话',
    content: '终于见到了，特别开心。',
    extractedText: '终于见到了，特别开心。',
  },
];

test('uses local fallback to describe every evidence artifact', async () => {
  const result = await analyzeEvidenceArtifacts(artifacts, {});

  assert.equal(result.source, 'rule');
  assert.equal(result.provider.canUseVision, false);
  assert.equal(result.artifacts.length, 4);
  assert.match(result.artifacts[0].aiDescription, /画面/);
  assert.match(result.artifacts[1].aiDescription, /视频首帧/);
  assert.match(result.artifacts[2].aiDescription, /音量很高/);
  assert.match(result.summaryText, /终于见到了/);
});

test('calls an OpenAI-compatible vision endpoint and normalizes artifact analyses', async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  analyses: [
                    {
                      artifactId: 'photo',
                      aiDescription: '画面里有强烈舞台灯光和人群挥手。',
                      atmosphere: '热烈',
                      emotionTags: ['热烈', '释放'],
                      confidence: 0.86,
                    },
                    {
                      artifactId: 'video',
                      aiDescription: '视频首帧显示合唱时刻，氛围明亮。',
                      atmosphere: '集体共鸣',
                      emotionTags: ['热烈', '共鸣'],
                      confidence: 0.82,
                    },
                  ],
                  summaryText: '现场氛围热烈，用户对合唱和舞台灯光印象很深。',
                }),
              },
            },
          ],
        };
      },
    };
  };

  const result = await analyzeEvidenceArtifacts(artifacts, {
    apiKey: 'test-key',
    baseUrl: 'https://example.test/api/v3',
    model: 'vision-model',
    fetcher,
  });

  const body = JSON.parse(calls[0].init.body);
  const content = body.messages[1].content;

  assert.equal(result.source, 'ai');
  assert.equal(result.provider.canUseVision, true);
  assert.equal(result.artifacts[0].aiDescription, '画面里有强烈舞台灯光和人群挥手。');
  assert.deepEqual(result.artifacts[0].emotionTags, ['热烈', '释放']);
  assert.match(result.summaryText, /现场氛围热烈/);
  assert.equal(content.filter((item) => item.type === 'image_url').length, 2);
});

test('falls back to local artifact descriptions when AI response is invalid', async () => {
  const result = await analyzeEvidenceArtifacts(artifacts, {
    apiKey: 'test-key',
    baseUrl: 'https://example.test/api/v3',
    model: 'vision-model',
    fetcher: async () => ({
      ok: true,
      async json() {
        return {
          choices: [{ message: { content: 'not json' } }],
        };
      },
    }),
  });

  assert.equal(result.source, 'fallback');
  assert.equal(result.provider.canUseVision, false);
  assert.match(result.summaryText, /浏览器音频特征/);
});
