import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractConcertInfoFromTicket,
  inferConcertInfoFromText,
} from './ticketExtraction.ts';

test('infers Jay Chou concert info from ticket text', () => {
  const result = inferConcertInfoFromText('周杰伦 嘉年华 世界巡回演唱会 上海 体育场 2025.09.12');

  assert.equal(result.concertInfo.artist, '周杰伦');
  assert.equal(result.concertInfo.concertName, '嘉年华世界巡回演唱会');
  assert.equal(result.concertInfo.city, '上海');
  assert.equal(result.concertInfo.venue, '上海体育场');
  assert.equal(result.needsReview, false);
  assert.equal(result.source, 'local-rule');
});

test('infers Taylor Swift concert info from uploaded file name', async () => {
  const result = await extractConcertInfoFromTicket({
    fileName: 'taylor-swift-eras-tour-singapore-ticket.png',
  });

  assert.equal(result.concertInfo.artist, 'Taylor Swift');
  assert.equal(result.concertInfo.concertName, 'The Eras Tour');
  assert.equal(result.concertInfo.city, '新加坡');
  assert.equal(result.needsReview, false);
});

test('uses editable fallback when ticket content is not recognized', async () => {
  const result = await extractConcertInfoFromTicket({
    fileName: 'my-ticket-photo.png',
  });

  assert.equal(result.concertInfo.artist, '待确认艺人');
  assert.equal(result.concertInfo.concertName, '待确认现场');
  assert.equal(result.needsReview, true);
  assert.equal(result.source, 'demo-fallback');
});

test('uses Baidu OCR and Ark responses to extract concert info', async () => {
  const requests = [];
  const fetcher = async (url, init) => {
    requests.push({ url, init });
    if (url.startsWith('https://aip.baidubce.com/oauth/2.0/token')) {
      return {
        ok: true,
        async json() {
          return { access_token: 'baidu-token', expires_in: 2592000 };
        },
      };
    }
    if (url.startsWith('https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic')) {
      return {
        ok: true,
        async json() {
          return {
            words_result: [
              { words: '蔡依林 Ugly Beauty 世界巡回演唱会' },
              { words: '2025.08.16 上海 梅赛德斯奔驰文化中心' },
            ],
          };
        },
      };
    }
    return {
      ok: true,
      async json() {
        return {
          output: [
            { type: 'reasoning', content: [{ type: 'reasoning_text', text: 'ignored' }] },
            {
              type: 'message',
              content: [{
                type: 'output_text',
                text: JSON.stringify({
                  artist: '蔡依林',
                  concertName: 'Ugly Beauty 世界巡回演唱会',
                  date: '2025.08.16',
                  city: '上海',
                  venue: '梅赛德斯奔驰文化中心',
                }),
              }],
            },
          ],
        };
      },
    };
  };

  const result = await extractConcertInfoFromTicket(
    {
      fileName: 'IMG_1234.png',
      imageData: 'data:image/png;base64,abc123',
    },
    {
      baiduApiKey: 'baidu-ak-markdown',
      baiduSecretKey: 'baidu-sk-markdown',
      arkApiKey: 'ark-key',
      arkModel: 'doubao-seed-2-0-mini-260428',
      fetcher,
    },
  );

  assert.equal(result.source, 'ocr-ark');
  assert.equal(result.concertInfo.artist, '蔡依林');
  assert.equal(result.concertInfo.concertName, 'Ugly Beauty 世界巡回演唱会');
  assert.equal(result.rawText, '蔡依林 Ugly Beauty 世界巡回演唱会\n2025.08.16 上海 梅赛德斯奔驰文化中心');
  assert.equal(result.needsReview, false);
  assert.equal(requests.length, 3);

  assert.match(requests[0].url, /client_id=baidu-ak/);
  assert.match(requests[0].url, /client_secret=baidu-sk/);
  assert.equal(requests[1].init.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(requests[1].init.body, 'image=abc123');

  assert.equal(requests[2].url, 'https://ark.cn-beijing.volces.com/api/v3/responses');
  assert.equal(requests[2].init.headers.Authorization, 'Bearer ark-key');
  const body = JSON.parse(requests[2].init.body);
  assert.deepEqual(Object.keys(body).sort(), ['input', 'model']);
  assert.equal(body.model, 'doubao-seed-2-0-mini-260428');
  assert.match(body.input[0].content[0].text, /蔡依林 Ugly Beauty/);
});

test('falls back to local ticket rules when vision AI fails', async () => {
  const result = await extractConcertInfoFromTicket(
    {
      fileName: 'jay-chou-ticket.png',
      imageData: 'data:image/png;base64,abc123',
    },
    {
      baiduApiKey: 'baidu-ak',
      baiduSecretKey: 'baidu-sk',
      arkApiKey: 'ark-key',
      arkModel: 'doubao-seed-2-0-mini-260428',
      fetcher: async () => ({ ok: false, status: 500 }),
    },
  );

  assert.equal(result.source, 'local-rule');
  assert.equal(result.concertInfo.artist, '周杰伦');
});

test('parses Ark message JSON wrapped in a markdown code block', async () => {
  let call = 0;
  const result = await extractConcertInfoFromTicket(
    {
      fileName: 'ticket.png',
      imageData: 'data:image/png;base64,abc123',
    },
    {
      baiduApiKey: 'baidu-ak',
      baiduSecretKey: 'baidu-sk',
      arkApiKey: 'ark-key',
      arkModel: 'doubao-seed-2-0-mini-260428',
      fetcher: async () => {
        call += 1;
        if (call === 1) return { ok: true, async json() { return { access_token: 'token', expires_in: 3600 }; } };
        if (call === 2) return { ok: true, async json() { return { words_result: [{ words: '周杰伦 上海体育场' }] }; } };
        return {
          ok: true,
          async json() {
            return {
              output: [{
                type: 'message',
                content: [{ type: 'output_text', text: '```json\\n{\"artist\":\"周杰伦\",\"concertName\":\"嘉年华世界巡回演唱会\",\"date\":\"2025.09.12\",\"city\":\"上海\",\"venue\":\"上海体育场\"}\\n```' }],
              }],
            };
          },
        };
      },
    },
  );

  assert.equal(result.source, 'ocr-ark');
  assert.equal(result.concertInfo.artist, '周杰伦');
  assert.equal(result.concertInfo.venue, '上海体育场');
});

test('marks missing Ark fields for review and preserves OCR raw text', async () => {
  let call = 0;
  const result = await extractConcertInfoFromTicket(
    { imageData: 'data:image/jpeg;base64,dGlja2V0' },
    {
      baiduApiKey: 'missing-fields-ak',
      baiduSecretKey: 'missing-fields-sk',
      arkApiKey: 'ark-key',
      arkModel: 'doubao-seed-2-0-mini-260428',
      fetcher: async () => {
        call += 1;
        if (call === 1) return { ok: true, async json() { return { access_token: 'token', expires_in: 3600 }; } };
        if (call === 2) return { ok: true, async json() { return { words_result: [{ words: '五月天 鸟巢' }] }; } };
        return {
          ok: true,
          async json() {
            return { output: [{ type: 'message', content: [{ text: '{"artist":"五月天"}' }] }] };
          },
        };
      },
    },
  );

  assert.equal(result.source, 'ocr-ark');
  assert.equal(result.concertInfo.artist, '五月天');
  assert.equal(result.concertInfo.venue, '待确认场馆');
  assert.equal(result.needsReview, true);
  assert.equal(result.rawText, '五月天 鸟巢');
});

test('falls back to local rules when Ark request fails after OCR', async () => {
  let call = 0;
  const result = await extractConcertInfoFromTicket(
    { fileName: 'jay-chou-ticket.png', imageData: 'data:image/png;base64,abc123' },
    {
      baiduApiKey: 'ark-failure-ak',
      baiduSecretKey: 'ark-failure-sk',
      arkApiKey: 'ark-key',
      arkModel: 'doubao-seed-2-0-mini-260428',
      fetcher: async () => {
        call += 1;
        if (call === 1) return { ok: true, async json() { return { access_token: 'token', expires_in: 3600 }; } };
        if (call === 2) return { ok: true, async json() { return { words_result: [{ words: '周杰伦' }] }; } };
        return { ok: false, status: 500 };
      },
    },
  );

  assert.equal(result.source, 'local-rule');
  assert.equal(result.concertInfo.artist, '周杰伦');
});

test('aborts a timed out external request and falls back', async () => {
  const result = await extractConcertInfoFromTicket(
    { fileName: 'jay-chou-ticket.png', imageData: 'data:image/png;base64,abc123' },
    {
      baiduApiKey: 'timeout-ak',
      baiduSecretKey: 'timeout-sk',
      arkApiKey: 'ark-key',
      arkModel: 'doubao-seed-2-0-mini-260428',
      timeoutMs: 5,
      fetcher: async (_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }),
    },
  );

  assert.equal(result.source, 'local-rule');
  assert.equal(result.concertInfo.artist, '周杰伦');
});
