import React, { useEffect, useState } from "react";
import { Linking, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { randomUUID } from "expo-crypto";
import { Button, Card, Copy, Field, Heading, Label, Page, s, useT } from "./ui";
import { useStore } from "./store";
import { supabase, requireOK } from "./client";
import { findVideoLink, importSource, videoUploadProblem } from "./mobile-domain.mjs";
import { RecipeCard } from "./MealScreens";
import type { Recipe } from "./types";

// The server allows 125 s for video analysis; the app waits a little longer.
const IMPORT_TIMEOUT_MS = 140_000;

type PickedVideo = { uri: string; mimeType: string; ext: string; seconds: number };

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
    [recipe, setRecipe] = useState<Recipe | null>(null);
  const found = findVideoLink(link);
  const instagram = importSource(chosen, link) === "instagram";

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
      <Heading>
        {instagram
          ? t("Turn a Reel into a recipe.", "把 IG Reels 變成食譜。")
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
                title={option === "instagram" ? "Instagram Reels" : "YouTube"}
                onPress={() => choose(option)}
              />
            </View>
          );
        })}
      </View>
      {instagram ? (
        <Card>
          <Text style={s.title}>{t("Three steps", "三個步驟")}</Text>
          <Copy>
            {t(
              "1. In Instagram, open the Reel and tap Share. Choose Chef Jarvis, or Copy link.\n2. Paste the link below if you copied it.\n3. Paste the post caption, or save the Reel to your Photos and choose it below. Instagram does not let apps read Reels directly.",
              "1. 在 Instagram 打開 Reel，點「分享」，選 Chef Jarvis，或選「複製連結」。\n2. 如果是複製連結，貼在下面。\n3. 貼上貼文說明文字，或把 Reel 存到相簿後在下面選擇。Instagram 不讓其他 App 直接讀取影片。",
            )}
          </Copy>
          <Button
            quiet
            disabled={working}
            title={t("Open Instagram", "打開 Instagram")}
            onPress={() => st.run(openInstagram)}
          />
        </Card>
      ) : (
        <Copy>
          {t(
            "Paste a YouTube link. Jarvis rewrites it as a simple step-by-step recipe, checks it against your allergies, and saves it to your collection.",
            "貼上 YouTube 影片連結，Jarvis 會整理成簡單的逐步食譜，依你的過敏設定檢查後存進收藏。",
          )}
        </Copy>
      )}
      <Field
        label={instagram ? t("Reel link", "Reels 連結") : t("Video link", "影片連結")}
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
          <Text style={s.title}>{t("Caption or saved Reel", "說明文字或已存的 Reel")}</Text>
          <Copy>
            {t(
              "Either one is enough. Choose the video if the caption has no recipe.",
              "擇一即可。如果說明裡沒有食譜，請改選影片。",
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
