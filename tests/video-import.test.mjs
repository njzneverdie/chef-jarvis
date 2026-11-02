import assert from "node:assert/strict";
import test from "node:test";
import {
  parseImportVerdict,
  parseUploadPath,
  parseVideoSource,
  videoImportInputs,
  videoImportMessage,
  videoImportsRemaining,
} from "../supabase/functions/_shared/video-import.js";

test("YouTube watch, youtu.be and Shorts links share one canonical URL", () => {
  for (const link of [
    "https://www.youtube.com/watch?v=abcdefghijk&t=3",
    "youtu.be/abcdefghijk?si=share",
    "https://m.youtube.com/shorts/abcdefghijk",
  ]) {
    assert.deepEqual(parseVideoSource(link), {
      platform: "youtube",
      id: "abcdefghijk",
      url: "https://www.youtube.com/watch?v=abcdefghijk",
    }, link);
  }
});

test("Instagram reel and post links keep only the shortcode", () => {
  assert.equal(parseVideoSource("https://www.instagram.com/reels/C1a2B3c4D5e/?igsh=x").url, "https://www.instagram.com/reel/C1a2B3c4D5e/");
  assert.equal(parseVideoSource("https://instagram.com/p/C1a2B3c4D5e").platform, "instagram");
});

test("other hosts, profiles and malformed links are refused", () => {
  for (const link of [
    "https://evil.example/reel/abc",
    "https://www.instagram.com/chef_someone/",
    "https://youtube.com.evil.example/shorts/abcdefghijk",
    "https://www.youtube.com/watch?v=short",
    "javascript:alert(1)",
    "https://user:pw@youtube.com/shorts/abcdefghijk",
    42,
  ]) {
    assert.equal(parseVideoSource(link), null, String(link));
  }
});

test("upload paths must sit in the caller's own folder", () => {
  const user = "00000000-0000-4000-8000-000000000001";
  const file = "22222222-3333-4444-8555-666666666666";
  assert.equal(parseUploadPath(`${user}/${file}.mov`, user), `${user}/${file}.mov`);
  assert.equal(parseUploadPath(undefined, user), null);
  assert.throws(() => parseUploadPath(`99999999-0000-4000-8000-000000000001/${file}.mp4`, user));
  assert.throws(() => parseUploadPath(`${user}/../${file}.mp4`, user));
  assert.throws(() => parseUploadPath(`${user}/${file}.exe`, user));
});

test("Instagram needs a caption or an uploaded video; YouTube is read directly", () => {
  const ig = parseVideoSource("instagram.com/reel/C1a2B3c4D5e");
  const yt = parseVideoSource("youtu.be/abcdefghijk");
  assert.equal(videoImportInputs({ source: ig, caption: "", uploadPath: null }).error, "needs_content");
  assert.equal(videoImportInputs({ source: ig, caption: "short", uploadPath: null }).error, "needs_content");
  assert.equal(videoImportInputs({ source: ig, caption: "x".repeat(40), uploadPath: null }).video, null);
  assert.equal(videoImportInputs({ source: ig, caption: "", uploadPath: "u/f.mp4" }).video.kind, "upload");
  assert.equal(videoImportInputs({ source: yt, caption: "", uploadPath: null }).video.kind, "youtube");
  assert.equal(videoImportInputs({ source: null, caption: "", uploadPath: null }).error, "invalid_link");
});

test("estimate indexes are bounded to the validated recipe", () => {
  const plan = { ingredients: [{}, {}], steps: [{}] };
  assert.deepEqual(
    parseImportVerdict({ is_recipe: true, estimated_ingredients: [1, 1, 5, -1, "0"], estimated_steps: [0, 2] }, plan),
    { is_recipe: true, estimated_ingredients: [1], estimated_steps: [0] },
  );
  assert.equal(parseImportVerdict(null, plan).is_recipe, false);
});

test("daily allowance and messages stay single-language", () => {
  assert.equal(videoImportsRemaining(3), 7);
  assert.equal(videoImportsRemaining(12), 0);
  assert.equal(videoImportsRemaining(Number.NaN), 0);
  for (const code of ["invalid_link", "needs_content", "not_a_recipe", "daily_limit", "restricted", "unavailable", "video_unavailable"]) {
    assert.doesNotMatch(videoImportMessage(code, "en"), /[一-鿿]/, code);
    assert.doesNotMatch(videoImportMessage(code, "zh-TW").replace(/YouTube|Instagram/g, ""), /[A-Za-z]/, code);
  }
});
