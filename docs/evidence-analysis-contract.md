# Evidence Analysis Contract

`POST /api/analyze-evidence` is the future multimodal analysis entry point.

The front end sends standardized `EvidenceArtifact[]` objects. Images use `previewUrl`; videos use `visualFrameDataUrl`, which is the extracted first frame; audio uses browser Web Audio feature summaries; text uses `extractedText`.

## Request

```json
{
  "artifacts": [
    {
      "id": "photo",
      "type": "image",
      "sourceType": "photo",
      "label": "照片",
      "content": "stage.jpg",
      "previewUrl": "data:image/jpeg;base64,...",
      "extractedText": "用户上传了照片线索：stage.jpg。"
    }
  ]
}
```

## Expected AI JSON

```json
{
  "analyses": [
    {
      "artifactId": "photo",
      "aiDescription": "画面里有强烈舞台灯光和人群挥手。",
      "atmosphere": "热烈",
      "emotionTags": ["热烈", "释放"],
      "confidence": 0.86
    }
  ],
  "summaryText": "现场氛围热烈，用户对合唱和舞台灯光印象很深。"
}
```

## Fallback Behavior

If no AI key is configured or the response cannot be parsed, the app keeps running with local artifact descriptions. The enriched artifacts are then passed into `/api/analyze-memory`.
