import React, { useEffect, useState } from "react";
import { Alert, Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StoreProvider, useStore } from "./src/store";
import { Busy, Button, colors, LangContext, s, useT } from "./src/ui";
import { AuthScreen, ProfileScreen } from "./src/AccountScreens";
import { HomeScreen, PlanScreen, SavedScreen } from "./src/MealScreens";
import {
  PantryScreen,
  ShoppingScreen,
  WeekScreen,
  NutritionScreen,
} from "./src/InventoryScreens";
import { CookScreen, useCookingAlarms } from "./src/CookScreen";
import { Onboarding } from "./src/Onboarding";
import { ImportScreen } from "./src/VideoImport";
export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Root />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
function Root() {
  const st = useStore();
  return (
    <LangContext.Provider value={st.lang}>
      <Shell key={st.userId || "signed-out"} />
    </LangContext.Provider>
  );
}
function Shell() {
  const st = useStore(),
    t = useT(),
    [tab, setTab] = useState("Home"),
    [history, setHistory] = useState<string[]>([]);
  useCookingAlarms();
  // A video link shared into the app opens the import screen.
  useEffect(() => {
    if (st.pendingImport && st.session) go("Import");
  }, [st.pendingImport, st.session]);
  // Errors pop up wherever the user is scrolled (the header line alone was
  // easy to miss further down a page).
  useEffect(() => {
    if (!st.error) return;
    Alert.alert(t("Something went wrong", "發生問題"), st.error, [
      { text: t("OK", "好"), onPress: () => st.setError("") },
    ]);
  }, [st.error]);
  const tabs = ["Home", "Plan", "Pantry", "Shopping", "Cook", "Profile"];
  const go = (next: string) => {
    if (next === tab) return;
    setHistory((stack) => (tabs.includes(next) ? [] : [...stack, tab].slice(-5)));
    setTab(next);
  };
  const back = () => {
    const previous = history[history.length - 1] || "Home";
    setHistory((stack) => stack.slice(0, -1));
    setTab(previous);
  };
  const views: Record<string, React.ReactNode> = {
    Home: <HomeScreen go={go} />,
    Plan: <PlanScreen go={go} />,
    Saved: <SavedScreen go={go} />,
    Pantry: <PantryScreen go={go} />,
    Shopping: <ShoppingScreen go={go} />,
    Week: <WeekScreen go={go} />,
    Nutrition: <NutritionScreen />,
    Cook: <CookScreen go={go} />,
    Import: <ImportScreen go={go} />,
    ImportInstagram: <ImportScreen go={go} initialSource="instagram" />,
    Profile: <ProfileScreen key={st.profile?.updated_at || "new"} />,
  };
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("Go home", "回首頁")}
          onPress={() => setTab("Home")}
        >
          <Text style={styles.logo}>
            Chef <Text style={{ fontStyle: "italic" }}>Jarvis</Text>
          </Text>
        </Pressable>
        <Button
          quiet
          title={st.lang === "en" ? "繁中" : "English"}
          onPress={() => st.setLang(st.lang === "en" ? "zh-TW" : "en")}
        />
      </View>
      {st.busy && <Busy />}
      {!st.ready ? (
        <Busy />
      ) : !st.session ? (
        <AuthScreen />
      ) : (
        <View style={{ flex: 1 }}>
          {!st.profileLoaded ||
          st.profile?.onboarding_completed ||
          st.onboardingSkipped ? (
            <>
              {!tabs.includes(tab) && (
                <Pressable
                  accessibilityRole="button"
                  onPress={back}
                  style={styles.back}
                >
                  <Text style={styles.backText}>{t("← Back", "← 返回")}</Text>
                </Pressable>
              )}
              {views[tab] || views.Home}
            </>
          ) : (
            <Onboarding />
          )}
          <View style={styles.nav}>
            {[
              ["Home", t("Home", "首頁")],
              ["Plan", t("Plan", "規劃")],
              ["Pantry", t("Kitchen", "食材")],
              ["Cook", t("Cook", "烹飪")],
              ["Profile", t("You", "我的")],
            ].map(([key, label]) => {
              // The 食材 tab covers both the pantry and the shopping lists.
              const active = key === "Pantry" ? tab === "Pantry" || tab === "Shopping" : tab === key;
              return (
              <Pressable
                key={key}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => go(key)}
                style={styles.navItem}
              >
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor:
                        active ? colors.green : "transparent",
                    },
                  ]}
                />
                <Text
                  style={{
                    color: active ? colors.green : colors.muted,
                    fontWeight: active ? "700" : "500",
                    fontSize: 14,
                  }}
                >
                  {label}
                </Text>
              </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: 22,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  logo: { fontFamily: "Georgia", fontSize: 25, color: colors.ink },
  nav: {
    flexDirection: "row",
    backgroundColor: colors.paper,
    borderTopWidth: 1,
    borderColor: colors.line,
    paddingBottom: 5,
  },
  navItem: {
    flex: 1,
    minHeight: 60,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  dot: { height: 4, width: 20, borderRadius: 2 },
  back: { paddingHorizontal: 22, paddingTop: 10, minHeight: 44, justifyContent: "center" },
  backText: { color: colors.green, fontSize: 16, fontWeight: "600" },
  error: {
    padding: 16,
    gap: 10,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
});
