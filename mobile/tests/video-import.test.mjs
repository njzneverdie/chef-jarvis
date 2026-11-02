import test from "node:test";
import assert from "node:assert/strict";
import { findVideoLink, importLinkFromURL, importSource, recentDownloadedVideo, videoUploadProblem } from "../src/mobile-domain.mjs";

test("shared text yields its first YouTube or Instagram link", () => {
  assert.deepEqual(findVideoLink("Look at this! https://youtube.com/shorts/abcdefghijk?si=x wow"), {
    platform: "youtube",
    url: "https://youtube.com/shorts/abcdefghijk?si=x",
  });
  assert.equal(findVideoLink("www.instagram.com/reel/C1a2B3c4D5e/").platform, "instagram");
  assert.equal(findVideoLink("https://example.com/video"), null);
});

test("only chefjarvis://import links open the import screen", () => {
  const link = encodeURIComponent("https://www.instagram.com/reel/C1a2B3c4D5e/");
  assert.equal(importLinkFromURL(`chefjarvis://import?url=${link}`), "https://www.instagram.com/reel/C1a2B3c4D5e/");
  assert.equal(importLinkFromURL("chefjarvis://auth/callback?code=1"), null);
  assert.equal(importLinkFromURL(`chefjarvis://import?url=${encodeURIComponent("https://evil.example")}`), null);
});

test("picked videos must be at most 5 minutes and 50 MB", () => {
  assert.equal(videoUploadProblem({ type: "video", duration: 60000, fileSize: 10e6 }, "en"), "");
  assert.match(videoUploadProblem({ type: "video", duration: 301000 }, "zh-TW"), /5 分鐘/);
  assert.match(videoUploadProblem({ type: "video", duration: 1000, fileSize: 60e6 }, "en"), /50 MB/);
  assert.doesNotMatch(videoUploadProblem({ type: "video", duration: 1000, fileSize: 60e6 }, "zh-TW"), /[A-Za-z]/);
  assert.match(videoUploadProblem({ type: "image" }, "en"), /video/);
});

test("a pasted link picks the YouTube or Instagram Reels form", () => {
  assert.equal(importSource("instagram", ""), "instagram");
  assert.equal(importSource("youtube", ""), "youtube");
  assert.equal(importSource(undefined, ""), "youtube");
  assert.equal(importSource("youtube", "https://www.instagram.com/reel/C1a2B3c4D5e/"), "instagram");
  assert.equal(importSource("instagram", "https://youtu.be/abcdefghijk"), "youtube");
});

test("only a video saved in the last 10 minutes is picked up automatically", () => {
  const now = Date.parse("2026-11-02T11:30:00Z");
  const video = (minutesAgo, seconds = 40, mediaType = "video") => ({
    id: `${minutesAgo}-${mediaType}`,
    mediaType,
    creationTime: now - minutesAgo * 60000,
    duration: seconds,
  });
  assert.equal(recentDownloadedVideo([video(1, 40, "photo"), video(2)], now).id, "2-video");
  assert.equal(recentDownloadedVideo([video(11)], now), null);
  assert.equal(recentDownloadedVideo([video(1, 301)], now), null);
  assert.equal(recentDownloadedVideo([], now), null);
});
