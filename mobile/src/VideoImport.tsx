import React, { useEffect, useRef, useState } from "react";
import { AppState, Linking, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { randomUUID } from "expo-crypto";
import { Button, Card, Copy, Field, Heading, Label, Page, s, useT } from "./ui";
import { useStore } from "./store";
import { supabase, requireOK } from "./client";
import { findVideoLink, importSource, videoUploadProblem } from "./mobile-domain.mjs";
import {
  findRecentDownload,
  markVideoHandled,
  takeAcceptedDownload,
  videoFromAsset,
  videoType,
  type PhotoAccess,
  type PickedVideo,
} from "./recentDownloads";
import { RecipeCard } from "./MealScreens";
import type { Recipe } from "./types";

// The server allows 125 s for video analysis; the app waits a little longer.
const IMPORT_TIMEOUT_MS = 140_000;

type Source = "youtube" | "instagram";

export function ImportScreen({
  go,
  initialSource = "youtube",
}: {
  go: (s: string) => void;
  initialSource?: Source;
}) {
  const st = useStore(),
    t = useT();
  const [chosen, setChosen] = useState<Source>(initialSource),
    [link, setLink] = useState(""),
    [caption, setCaption] = useState(""),
    [video, setVideo] = useState<PickedVideo | null>(null),
    [needsContent, setNeedsContent] = useState(false),
    [working, setWorking] = useState(false),
    [stage, setStage] = useState(0),
    [photoAccess, setPhotoAccess] = useState<PhotoAccess>("all"),
    [cancelled, setCancelled] = useState(false),
    [recipe, setRecipe] = useState<Recipe | null>(null);
  const found = findVideoLink(link);
  const instagram = importSource(chosen, link) === "instagram";
  // Bumped by Cancel; an import that started earlier then drops its result.
  const run = useRef(0);

  // A link shared into the app (chefjarvis://import?url=…) fills the field.
  useEffect(() => {
    if (!st.pendingImport) return;
    setLink(st.pendingImport);
    setRecipe(null);
    setVideo(null);
    setCaption("");
    setNeedsContent(false);
    setCancelled(false);
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

  // In the Instagram form, the Reel the user just saved with Instagram's
  // Download is imported by itself, no link needed: the one accepted from the
  // app-wide prompt, or else the newest recent download, checked again
  // whenever the app comes back to the foreground.
  const autoImport = instagram && !caption.trim() && !video && !working && !recipe;
  useEffect(() => {
    if (!autoImport) return;
    void st.run(importDownloadedReel);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void st.run(importDownloadedReel);
    });
    return () => sub.remove();
  }, [autoImport]);

  async function importDownloadedReel() {
    if (!st.profile?.onboarding_completed || !st.userId) return;
    let asset = takeAcceptedDownload();
    if (!asset) {
      const result = await findRecentDownload(st.userId, true);
      setPhotoAccess(result.access);
      asset = result.asset;
    }
    if (!asset) return;
    await markVideoHandled(st.userId, asset.id);
    const picked = await videoFromAsset(asset, st.lang);
    setVideo(picked);
    await importRecipe(picked);
  }

  function choose(next: Source) {
    setChosen(next);
    // A link from the other site no longer fits the chosen form.
    if (found && found.platform !== next) setLink("");
    setNeedsContent(false);
  }

  async function openInstagram() {
    try {
      await Linking.openURL("instagram://");
    } catch {
      await Linking.openURL("https://www.instagram.com/");
    }
  }

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
    setVideo({
      uri: asset.uri,
      ...videoType(asset.fileName || asset.uri),
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

  function cancel() {
    run.current += 1;
    setWorking(false);
    setVideo(null);
    setCancelled(true);
  }

  async function importRecipe(picked: PickedVideo | null = video) {
    if (!st.profile?.onboarding_completed) {
      st.resumeOnboarding();
      return;
    }
    // An uploaded video needs no link; a link, when known, is kept as the source.
    const upload = instagram && picked ? picked : null;
    if (!found && !upload)
      throw new Error(
        t("Paste a YouTube or Instagram video link.", "請貼上 YouTube 或 Instagram 的影片連結。"),
      );
    const current = ++run.current;
    setWorking(true);
    setCancelled(false);
    setRecipe(null);
    try {
      const uploadPath = upload ? await uploadVideo(upload) : null;
      if (current !== run.current) {
        // Cancelled during the upload: nothing was analysed, so drop the file.
        if (uploadPath) await supabase.storage.from("video-imports").remove([uploadPath]);
        return;
      }
      let result: any;
      try {
        result = await st.edge(
          "chef-meal-plan",
          {
            mode: "video_import",
            language: st.lang,
            ...(found ? { source_url: found.url } : { source: "camera_roll" }),
            ...(instagram && caption.trim() ? { caption: caption.trim() } : {}),
            ...(uploadPath ? { upload_path: uploadPath } : {}),
          },
          IMPORT_TIMEOUT_MS,
        );
      } catch (error: any) {
        // Instagram needs the caption or the video; the inline hint says so
        // without a pop-up covering the screen.
        if (/caption|說明文字/.test(String(error?.message || ""))) {
          setNeedsContent(true);
          return;
        }
        throw error;
      }
      if (current !== run.current) return;
      if (!result?.plan)
        throw new Error(t("No valid recipe returned.", "未取得有效食譜。"));
      setRecipe(result.plan);
      setVideo(null);
      await st.refresh();
    } finally {
      if (current === run.current) setWorking(false);
    }
  }

  return (
    <Page>
      <Label>{t("From a cooking video", "從料理短影片")}</Label>
      <Heading>
        {instagram
          ? t("Turn a Reel into a recipe.", "把 Instagram 影片變成食譜。")
          : t("Turn a video into a recipe.", "把影片變成食譜。")}
      </Heading>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["youtube", "instagram"] as const).map((option) => {
          const active = (option === "instagram") === instagram;
          return (
            <View key={option} style={{ flex: 1 }}>
              <Button
                quiet={!active}
                selected={active}
                disabled={working}
                title={option === "instagram" ? t("Instagram Reels", "Instagram") : "YouTube"}
                onPress={() => choose(option)}
              />
            </View>
          );
        })}
      </View>
      {instagram ? (
        !video && (
          <Card>
            <Text style={s.title}>
              {t(
                "In Instagram: Share → Download, then open Chef Jarvis",
                "在 Instagram 按 分享 → 下載，然後打開 Chef Jarvis",
              )}
            </Text>
            <Copy>
              {t(
                "Chef Jarvis finds the video you just downloaded and turns it into a recipe by itself.",
                "Chef Jarvis 會自動找到剛下載的影片並整理成食譜。",
              )}
            </Copy>
            {photoAccess === "limited" && (
              <Text style={s.error}>
                {t(
                  "To find it by itself, allow Full Access under Settings → Chef Jarvis → Photos. You can also choose the video below.",
                  "要自動找到影片，請到 設定 → Chef Jarvis → 照片 選「完整取用」；也可以在下面自己選影片。",
                )}
              </Text>
            )}
            <Button
              quiet
              disabled={working}
              title={t("Open Instagram", "打開 Instagram")}
              onPress={() => st.run(openInstagram)}
            />
          </Card>
        )
      ) : (
        <Copy>
          {t(
            "Paste a YouTube link. Jarvis rewrites it as a simple step-by-step recipe, checks it against your allergies, and saves it to your collection.",
            "貼上 YouTube 影片連結，Jarvis 會整理成簡單的逐步食譜，依你的過敏設定檢查後存進收藏。",
          )}
        </Copy>
      )}
      <Field
        label={
          instagram
            ? t("Instagram link (optional)", "Instagram 影片連結（可不填）")
            : t("Video link", "影片連結")
        }
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
      {instagram && video?.downloaded && (
        <Card>
          <Text style={s.title}>
            {t(
              `Found the video you just downloaded (${video.seconds} s)`,
              `已找到剛下載的影片（${video.seconds} 秒）`,
            )}
          </Text>
          <Copy>
            {t(
              "The video is uploaded only for analysis and deleted right after.",
              "影片只會上傳分析，分析完立即刪除。",
            )}
          </Copy>
        </Card>
      )}
      {instagram && !video?.downloaded && (
        <Card>
          <Text style={s.title}>{t("Or add it yourself", "或自己加入")}</Text>
          <Copy>
            {t(
              "Paste the post caption, or choose the saved video. Either one is enough.",
              "貼上貼文說明文字，或選擇存好的影片，擇一即可。",
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
      {working ? (
        <Button quiet title={t("Cancel", "取消")} onPress={cancel} />
      ) : (
        <Button
          disabled={st.busy || !(found || (instagram && video))}
          title={t("Make it a recipe", "整理成食譜")}
          onPress={() => st.run(() => importRecipe())}
        />
      )}
      {cancelled && (
        <Text style={s.fieldLabel}>
          {t(
            "Cancelled. If the analysis had already started, the recipe may still appear in your collection.",
            "已取消。如果分析已經開始，食譜仍可能出現在收藏裡。",
          )}
        </Text>
      )}
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
