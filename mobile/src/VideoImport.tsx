import React, { useEffect, useState } from "react";
import { Text } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { randomUUID } from "expo-crypto";
import { Button, Card, Copy, Field, Heading, Label, Page, s, useT } from "./ui";
import { useStore } from "./store";
import { supabase, requireOK } from "./client";
import { findVideoLink, videoUploadProblem } from "./mobile-domain.mjs";
import { RecipeCard } from "./MealScreens";
import type { Recipe } from "./types";

// The server allows 125 s for video analysis; the app waits a little longer.
const IMPORT_TIMEOUT_MS = 140_000;

type PickedVideo = { uri: string; mimeType: string; ext: string; seconds: number };

export function ImportScreen({ go }: { go: (s: string) => void }) {
  const st = useStore(),
    t = useT();
  const [link, setLink] = useState(""),
    [caption, setCaption] = useState(""),
    [video, setVideo] = useState<PickedVideo | null>(null),
    [needsContent, setNeedsContent] = useState(false),
    [working, setWorking] = useState(false),
    [stage, setStage] = useState(0),
    [recipe, setRecipe] = useState<Recipe | null>(null);
  const found = findVideoLink(link);
  const instagram = found?.platform === "instagram";

  // A link shared into the app (chefjarvis://import?url=…) fills the field.
  useEffect(() => {
    if (!st.pendingImport) return;
    setLink(st.pendingImport);
    setRecipe(null);
    setVideo(null);
    setCaption("");
    setNeedsContent(false);
    st.setPendingImport(null);
  }, [st.pendingImport]);

  useEffect(() => {
    setStage(0);
    if (!working) return;
    const timers = [
      setTimeout(() => setStage(1), 10000),
      setTimeout(() => setStage(2), 40000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [working]);

  async function pickVideo() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    const problem = videoUploadProblem(asset, st.lang);
    if (problem) throw new Error(problem);
    const name = (asset.fileName || asset.uri).toLowerCase();
    const ext = name.endsWith(".mov") ? "mov" : name.endsWith(".m4v") ? "m4v" : "mp4";
    setVideo({
      uri: asset.uri,
      ext,
      mimeType: ext === "mov" ? "video/quicktime" : ext === "m4v" ? "video/x-m4v" : "video/mp4",
      seconds: Math.round(Number(asset.duration || 0) / 1000),
    });
  }

  async function uploadVideo(picked: PickedVideo) {
    const path = `${st.userId}/${randomUUID()}.${picked.ext}`;
    const bytes = await new File(picked.uri).arrayBuffer();
    requireOK(
      await supabase.storage
        .from("video-imports")
        .upload(path, bytes, { contentType: picked.mimeType, upsert: false }),
    );
    return path;
  }

  async function importRecipe() {
    if (!st.profile?.onboarding_completed) {
      st.resumeOnboarding();
      return;
    }
    if (!found)
      throw new Error(
        t("Paste a YouTube or Instagram video link.", "請貼上 YouTube 或 Instagram 的影片連結。"),
      );
    setWorking(true);
    setRecipe(null);
    try {
      const uploadPath = instagram && video ? await uploadVideo(video) : null;
      let result: any;
      try {
        result = await st.edge(
          "chef-meal-plan",
          {
            mode: "video_import",
            language: st.lang,
            source_url: found.url,
            ...(instagram && caption.trim() ? { caption: caption.trim() } : {}),
            ...(uploadPath ? { upload_path: uploadPath } : {}),
          },
          IMPORT_TIMEOUT_MS,
        );
      } catch (error: any) {
        // The server explains that Instagram needs the caption or the video.
        if (/caption|說明文字/.test(String(error?.message || ""))) setNeedsContent(true);
        throw error;
      }
      if (!result?.plan)
        throw new Error(t("No valid recipe returned.", "未取得有效食譜。"));
      setRecipe(result.plan);
      setVideo(null);
      await st.refresh();
    } finally {
      setWorking(false);
    }
  }

  return (
    <Page>
      <Label>{t("From a cooking video", "從料理短影片")}</Label>
      <Heading>{t("Turn a video into a recipe.", "把影片變成食譜。")}</Heading>
      <Copy>
        {t(
          "Paste a YouTube or Instagram link. Jarvis rewrites it as a simple step-by-step recipe, checks it against your allergies, and saves it to your collection.",
          "貼上 YouTube 或 Instagram 的影片連結，Jarvis 會整理成簡單的逐步食譜，依你的過敏設定檢查後存進收藏。",
        )}
      </Copy>
      <Field
        label={t("Video link", "影片連結")}
        value={link}
        onChange={(value) => {
          setLink(value);
          setNeedsContent(false);
        }}
      />
      {!!link && !found && (
        <Text style={s.error}>
          {t("This is not a YouTube or Instagram video link.", "這不是 YouTube 或 Instagram 的影片連結。")}
        </Text>
      )}
      {instagram && (
        <Card>
          <Text style={s.title}>{t("Instagram needs one more thing", "Instagram 還需要一樣東西")}</Text>
          <Copy>
            {t(
              "Instagram does not let apps read Reels. Copy the post caption in Instagram and paste it below. If the caption has no recipe, save the Reel to your Photos and choose it here instead.",
              "Instagram 不讓其他 App 讀取影片內容。請在 Instagram 複製貼文說明文字貼在下面；如果說明裡沒有食譜，請把影片存到相簿，再從這裡選擇。",
            )}
          </Copy>
          <Field
            label={t("Post caption", "貼文說明文字")}
            value={caption}
            onChange={setCaption}
            multiline
          />
          <Button
            quiet
            disabled={working}
            title={
              video
                ? t(`Video chosen (${video.seconds} s) · choose another`, `已選影片（${video.seconds} 秒）・重新選擇`)
                : t("Choose a saved video", "從相簿選擇影片")
            }
            onPress={() => st.run(pickVideo)}
          />
          {video && (
            <Copy>
              {t(
                "The video is uploaded only for analysis and deleted right after.",
                "影片只會上傳分析，分析完立即刪除。",
              )}
            </Copy>
          )}
          {needsContent && !caption.trim() && !video && (
            <Text style={s.error}>
              {t("Paste the caption or choose the video first.", "請先貼上說明文字或選擇影片。")}
            </Text>
          )}
        </Card>
      )}
      <Button
        disabled={working || st.busy || !found}
        title={working ? t("Reading the video…", "正在讀取影片…") : t("Make it a recipe", "整理成食譜")}
        onPress={() => st.run(importRecipe)}
      />
      {working && (
        <Text accessibilityLiveRegion="polite" style={s.fieldLabel}>
          {
            [
              t("Watching the video and noting every ingredient…", "正在看影片並記下每樣食材…"),
              t("Writing simple steps and checking your allergies…", "正在整理簡單步驟並檢查過敏原…"),
              t("Almost done; a longer video can take up to 2 minutes. Keep this screen open…", "快好了，較長的影片最多需要 2 分鐘，請保持此畫面開啟…"),
            ][stage]
          }
        </Text>
      )}
      {recipe && (
        <>
          <Card>
            <Label>{t("Saved to your collection", "已存進收藏")}</Label>
            <Copy>
              {t(
                "Amounts or times marked “estimate” were not stated in the video; Jarvis filled them in. Check them as you cook.",
                "標示「推估」的份量或時間是影片沒有說明、由 Jarvis 補上的，烹飪時請留意。",
              )}
            </Copy>
          </Card>
          <RecipeCard
            key={JSON.stringify([recipe.title, recipe.ingredients])}
            recipe={recipe}
            onChange={setRecipe}
            go={go}
          />
        </>
      )}
    </Page>
  );
}
