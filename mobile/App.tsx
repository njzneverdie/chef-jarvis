import React, { useState } from "react";
import { Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
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
    [tab, setTab] = useState("Home");
  useCookingAlarms();
  const views: Record<string, React.ReactNode> = {
    Home: <HomeScreen go={setTab} />,
    Plan: <PlanScreen go={setTab} />,
    Saved: <SavedScreen go={setTab} />,
    Pantry: <PantryScreen />,
    Shopping: <ShoppingScreen />,
    Week: <WeekScreen />,
    Nutrition: <NutritionScreen />,
    Cook: <CookScreen />,
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
      {!!st.error && (
        <View accessibilityRole="alert" style={styles.error}>
          <Text selectable style={s.error}>
            {st.error}
          </Text>
          <Button
            quiet
            title={t("Dismiss", "關閉")}
            onPress={() => st.setError("")}
          />
        </View>
      )}
      {st.busy && <Busy />}
      {!st.ready ? (
        <Busy />
      ) : !st.session ? (
        <AuthScreen />
      ) : (
        <View style={{ flex: 1 }}>
          {views[tab] || views.Home}
          <View style={styles.nav}>
            {[
              ["Home", t("Home", "首頁")],
              ["Plan", t("Plan", "規劃")],
              ["Cook", t("Cook", "烹飪")],
              ["Shopping", t("Shop", "採買")],
              ["Profile", t("You", "我的")],
            ].map(([key, label]) => (
              <Pressable
                key={key}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === key }}
                onPress={() => setTab(key)}
                style={styles.navItem}
              >
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor:
                        tab === key ? colors.green : "transparent",
                    },
                  ]}
                />
                <Text
                  style={{
                    color: tab === key ? colors.green : colors.muted,
                    fontWeight: tab === key ? "700" : "500",
                    fontSize: 14,
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
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
  error: {
    padding: 16,
    gap: 10,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
});
