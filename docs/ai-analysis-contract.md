# AI Analysis Contract

`POST /api/analyze-memory` is the future API integration point for memory analysis and dynamic music recommendations.

The app currently works without an API key by using local rule analysis and a small fallback song catalog. When `AI_API_KEY` and `AI_MODEL` are configured, the AI response may include songs from any artist. These songs do not need to exist in `src/lib/songs.ts`.

## Expected AI JSON

```json
{
  "emotionTags": ["热烈", "释放"],
  "dominantEmotion": "热烈",
  "lostItem": "那个在人群中尽情发光的自己",
  "foundLocation": "全场灯光亮起的时候",
  "status": "已找回",
  "custody": "AI音乐档案库",
  "note": "那一刻不是幻觉，是你真的发过光。",
  "narrativeLines": [
    "你终于见到了蔡依林，也见到了发光的自己。",
    "《日不落》把它们压成一张可以重播的唱片。"
  ],
  "recommendedSongs": [
    {
      "title": "日不落",
      "artist": "蔡依林",
      "duration": "3:45",
      "tags": ["热烈", "释放", "快乐"],
      "stage": "全场发光",
      "reason": "适合把终于见到她的兴奋、人海里的闪光和快乐一起留下。"
    }
  ]
}
```

## Fallback Behavior

If the API key is missing, the model fails, or the response cannot be parsed, the app falls back to local rules and the local song catalog. This keeps the package runnable during demos and competitions.
