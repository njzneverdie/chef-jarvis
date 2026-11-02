import AsyncStorage from "@react-native-async-storage/async-storage";
import * as MediaLibrary from "expo-media-library/legacy";
import { File } from "expo-file-system";
import { recentDownloadedVideo, videoUploadProblem } from "./mobile-domain.mjs";

// Finds the cooking video the user just saved with Instagram's Download, so it
// can be imported without a link. Each video is offered or imported once.

export type PickedVideo = {
  uri: string;
  mimeType: string;
  ext: string;
  seconds: number;
  downloaded?: boolean;
  assetId?: string;
};

// "all": downloads are found by themselves; "ask": the import screen may still
// show the system prompt; "limited": the user picks the video by hand.
export type PhotoAccess = "all" | "ask" | "limited";

const handledKey = (userId: string) => `chefjarvis.videoImport.handled.${userId}`;

async function handledVideos(userId: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(handledKey(userId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function markVideoHandled(userId: string, assetId: string) {
  const list = (await handledVideos(userId)).filter((id) => id !== assetId);
  await AsyncStorage.setItem(handledKey(userId), JSON.stringify([...list, assetId].slice(-50)));
}

// `ask` shows the system Photos prompt; app-wide checks only read the status.
export async function findRecentDownload(
  userId: string,
  ask: boolean,
): Promise<{ access: PhotoAccess; asset: MediaLibrary.Asset | null }> {
  const permission = ask
    ? await MediaLibrary.requestPermissionsAsync(false, ["video"])
    : await MediaLibrary.getPermissionsAsync(false, ["video"]);
  if (!permission.granted || permission.accessPrivileges !== "all") {
    const undecided = permission.status === "undetermined" && permission.canAskAgain;
    return { access: undecided ? "ask" : "limited", asset: null };
  }
  const page = await MediaLibrary.getAssetsAsync({
    first: 5,
    mediaType: MediaLibrary.MediaType.video,
    sortBy: [[MediaLibrary.SortBy.creationTime, false]],
  });
  const handled = new Set(await handledVideos(userId));
  return {
    access: "all",
    asset: recentDownloadedVideo(page.assets.filter((asset) => !handled.has(asset.id))),
  };
}

export function videoType(name: string) {
  const lower = name.toLowerCase();
  const ext = lower.endsWith(".mov") ? "mov" : lower.endsWith(".m4v") ? "m4v" : "mp4";
  return {
    ext,
    mimeType: ext === "mov" ? "video/quicktime" : ext === "m4v" ? "video/x-m4v" : "video/mp4",
  };
}

export async function videoFromAsset(
  asset: MediaLibrary.Asset,
  language: string,
): Promise<PickedVideo> {
  const info = await MediaLibrary.getAssetInfoAsync(asset, { shouldDownloadFromNetwork: true });
  if (!info.localUri) throw new Error(language === "zh-TW" ? "無法讀取這支影片。" : "This video could not be read.");
  const problem = videoUploadProblem(
    { type: "video", duration: asset.duration * 1000, fileSize: new File(info.localUri).size },
    language,
  );
  if (problem) throw new Error(problem);
  return {
    uri: info.localUri,
    ...videoType(asset.filename || info.localUri),
    seconds: Math.round(asset.duration),
    downloaded: true,
    assetId: asset.id,
  };
}

// The app-wide prompt hands the accepted video to the import screen.
let acceptedAsset: MediaLibrary.Asset | null = null;
export function acceptDownload(asset: MediaLibrary.Asset) {
  acceptedAsset = asset;
}
export function takeAcceptedDownload() {
  const asset = acceptedAsset;
  acceptedAsset = null;
  return asset;
}
