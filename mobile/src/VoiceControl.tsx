import React, { useEffect, useState, useRef } from "react";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { Button, Copy, useT } from "./ui";
import { useStore } from "./store";
export function VoiceControl({
  onCommand,
}: {
  onCommand: (value: string) => void;
}) {
  const mounted = useRef(true);
  const st = useStore(),
    t = useT(),
    [listening, setListening] = useState(false),
    [heard, setHeard] = useState("");
  useSpeechRecognitionEvent("start", () => setListening(true));
  useSpeechRecognitionEvent("end", () => setListening(false));
  useSpeechRecognitionEvent("result", (event) => {
    if (event.isFinal) {
      const transcript = event.results[0]?.transcript || "";
      setHeard(transcript);
      onCommand(transcript);
    }
  });
  useSpeechRecognitionEvent("error", (event) => {
    if (event.error !== "aborted" && event.error !== "no-speech")
      st.setError(event.message);
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      ExpoSpeechRecognitionModule.abort();
    };
  }, []);
  return (
    <>
      <Button
        quiet
        title={
          listening
            ? t("Stop listening", "停止聆聽")
            : t("Voice command", "語音指令")
        }
        onPress={() =>
          st.run(async () => {
            if (listening) {
              ExpoSpeechRecognitionModule.stop();
              return;
            }
            if (!ExpoSpeechRecognitionModule.isRecognitionAvailable())
              throw new Error(
                t(
                  "Speech recognition is unavailable on this device.",
                  "此裝置無法使用語音辨識。",
                ),
              );
            const permission =
              await ExpoSpeechRecognitionModule.requestPermissionsAsync();
            if (!mounted.current) return;
            if (!permission.granted)
              throw new Error(
                t(
                  "Enable microphone and speech recognition in Settings.",
                  "請至設定啟用麥克風與語音辨識。",
                ),
              );
            ExpoSpeechRecognitionModule.start({
              lang: st.lang === "zh-TW" ? "zh-TW" : "en-US",
              interimResults: false,
              continuous: false,
            });
          })
        }
      />
      <Copy>
        {t(
          "Say “next”, “previous”, “read aloud”, or “start timer”. Speech may be processed by Apple; enable only when you choose to use it.",
          "可說「下一步」、「上一步」、「朗讀」或「開始計時」。語音可能由 Apple 處理；僅在你選擇使用時啟用。",
        )}
      </Copy>
      {!!heard && <Copy>{heard}</Copy>}
    </>
  );
}
