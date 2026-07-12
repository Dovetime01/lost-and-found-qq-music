import test from 'node:test';
import assert from 'node:assert/strict';

const {
  createEvidenceArtifact,
  describeAudioFeatures,
  summarizeArtifactsForAnalysis,
} = await import('./evidenceArtifacts.ts');

test('standardizes text evidence into a text artifact', () => {
  const artifact = createEvidenceArtifact({
    id: 'note',
    type: 'note',
    label: '一句话',
    content: '我好像把自己留在那晚了。',
  });

  assert.equal(artifact.type, 'text');
  assert.equal(artifact.sourceType, 'note');
  assert.equal(artifact.extractedText, '我好像把自己留在那晚了。');
});

test('standardizes photo evidence into an image artifact', () => {
  const artifact = createEvidenceArtifact({
    id: 'photo',
    type: 'photo',
    label: '照片',
    content: 'stage.jpg',
    previewUrl: 'data:image/jpeg;base64,abc',
  });

  assert.equal(artifact.type, 'image');
  assert.equal(artifact.previewUrl, 'data:image/jpeg;base64,abc');
  assert.equal(artifact.extractedText, '用户上传了照片线索：stage.jpg。');
});

test('standardizes video evidence with a visual frame placeholder', () => {
  const artifact = createEvidenceArtifact({
    id: 'video',
    type: 'video',
    label: '视频',
    content: 'chorus.mp4',
    previewUrl: 'data:video/mp4;base64,abc',
    visualFrameDataUrl: 'data:image/jpeg;base64,frame',
  });

  assert.equal(artifact.type, 'video');
  assert.equal(artifact.visualFrameDataUrl, 'data:image/jpeg;base64,frame');
  assert.match(artifact.extractedText, /视频首帧/);
});

test('describes browser audio features as text for later AI analysis', () => {
  const description = describeAudioFeatures({
    averageVolume: 0.82,
    peakVolume: 0.96,
    estimatedPitchHz: 392,
    durationSeconds: 45,
  });

  assert.match(description, /音量很高/);
  assert.match(description, /峰值接近爆发/);
  assert.match(description, /偏高/);
});

test('summarizes artifacts for memory analysis without losing media context', () => {
  const artifacts = [
    createEvidenceArtifact({
      id: 'note',
      type: 'note',
      label: '一句话',
      content: '终于见到了，特别开心。',
    }),
    createEvidenceArtifact({
      id: 'audio',
      type: 'audio',
      label: '声音',
      content: 'singalong.m4a',
      audioFeatures: {
        averageVolume: 0.8,
        peakVolume: 0.9,
        durationSeconds: 30,
      },
    }),
  ];

  const summary = summarizeArtifactsForAnalysis(artifacts);

  assert.match(summary, /一句话/);
  assert.match(summary, /终于见到了/);
  assert.match(summary, /声音/);
  assert.match(summary, /音量很高/);
});
