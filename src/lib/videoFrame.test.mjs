import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as videoFrame from './videoFrame.ts';

test('selects the midpoint of a video', () => {
  assert.equal(typeof videoFrame.selectVideoFrameTime, 'function');
  assert.equal(videoFrame.selectVideoFrameTime(120), 60);
  assert.equal(videoFrame.selectVideoFrameTime(9), 4.5);
});

test('uses a safe fallback for invalid duration', () => {
  assert.equal(typeof videoFrame.selectVideoFrameTime, 'function');
  assert.equal(videoFrame.selectVideoFrameTime(0), 0.1);
  assert.equal(videoFrame.selectVideoFrameTime(-3), 0.1);
  assert.equal(videoFrame.selectVideoFrameTime(Number.NaN), 0.1);
  assert.equal(videoFrame.selectVideoFrameTime(Number.POSITIVE_INFINITY), 0.1);
});

test('exports the required JPEG quality', () => {
  assert.equal(videoFrame.VIDEO_FRAME_JPEG_QUALITY, 0.8);
});
