# 百度 OCR + 豆包 Ark 票根识别设计

## 目标

仅将票根识别改为服务端两阶段链路：百度精准 OCR 读取图片文字，豆包 Ark 将 OCR 原文整理为演唱会信息。证据分析、记忆分析、QQ 音乐以及本地回退保持不变。

## 数据流

`POST /api/extract-concert-info` 保持现有请求和响应结构。服务端从 Data URL 中移除图片前缀，获取并缓存百度 access token，以表单方式调用 `accurate_basic`，再把 `words_result` 合并为原文。随后调用 Ark `/responses`，仅传 `model` 与 `input`，从 `output` 中选择 `type: "message"` 的文本并解析五个演唱会字段。

每个外部请求独立设置 15 秒超时。任一阶段失败或响应无效时，沿用现有文件名/提示文本本地规则。成功来源标记为 `ocr-ark`，OCR 原文写入 `rawText`。

## 配置与安全

百度 AK/SK、Ark API Key 和模型只从服务器环境变量读取。真实值写入已被忽略的 `.env.local`，示例文件及文档不包含真实密钥。百度 token 在进程内按 `expires_in` 缓存并提前 60 秒失效。

## 验证

单元测试覆盖 token、OCR 表单、Ark 请求及 message 解析、代码块 JSON、缺失字段、失败和超时回退。最后运行完整测试与 Next.js 构建。
