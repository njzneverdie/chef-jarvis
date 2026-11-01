import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { randomUUID } from "expo-crypto";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { Session } from "@supabase/supabase-js";
import { supabase, requireOK, handleAuthLink, edge } from "./client";
import type { Cooking, Recipe, Row } from "./types";
import { persistableCooking } from "./mobile-domain.mjs";
import "./shared-domain";
export const domain = (globalThis as any).ChefDomain;
const tables = [
  "pantry_items",
  "recipes",
  "shopping_lists",
  "meal_plans",
  "nutrition_logs",
  "saved_meal_cards",
  "recipe_feedback",
  "cooking_sessions",
] as const;
const StoreContext = createContext<any>(null);
export function useStore(): any {
  return useContext(StoreContext);
}
export function StoreProvider({ children }: React.PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null),
    [ready, setReady] = useState(false),
    [profile, setProfile] = useState<Row | null>(null),
    [data, setData] = useState<Record<string, Row[]>>({}),
    [cooking, setCooking] = useState<Cooking | null>(null),
    [plannedRecipe, setPlannedRecipe] = useState<Recipe | null>(null),
    [pendingPantryIdea, setPendingPantryIdea] = useState<{
      title: string;
      uses: string[];
    } | null>(null),
    [planningChoices, setPlanningChoices] = useState({
      ...domain.defaultMealPlanningChoices,
    }),
    [lang, setLang] = useState<"en" | "zh-TW">("en"),
    [localSkill, setLocalSkill] = useState<string | null>(null),
    [onboardingSkipped, setOnboardingSkipped] = useState(false),
    [profileLoadedFor, setProfileLoadedFor] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const owner = useRef<string | null>(null),
    epoch = useRef(0),
    cookingLoaded = useRef(false);
  const renderedOwner = session?.user.id || null,
    renderedEpoch = epoch.current;
  const cloudQueue = useRef(Promise.resolve());
  const ending = useRef<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const ended = useRef(new Set<string>());
  const currentCooking = useRef<Cooking | null>(null);
  currentCooking.current = cooking;
  const guard = (id: string | null, e: number) => {
    if (owner.current !== id || epoch.current !== e)
      throw new Error("Account changed. Please retry. 帳號已變更。");
  };
  async function refresh() {
    const id = renderedOwner,
      e = renderedEpoch;
    if (!id) return;
    guard(id, e);
    const [p, ...results] = await Promise.all([
      supabase
        .from("app_profiles")
        .select("*")
        .eq("app_user_id", id)
        .maybeSingle(),
      ...tables.map((table) =>
        supabase
          .from(table)
          .select("*")
          .eq(table === "saved_meal_cards" ? "app_user_id" : "user_id", id)
          .order("created_at", { ascending: false })
          .limit(100),
      ),
    ]);
    guard(id, e);
    requireOK(p);
    results.forEach(requireOK);
    setProfile(p.data);
    setProfileLoadedFor(id);
    setData(
      Object.fromEntries(tables.map((t, i) => [t, results[i].data || []])),
    );
  }
  // Skill and onboarding skip are kept per user on the device; the profile
  // column (once migrated) is the source of truth for skill.
  useEffect(() => {
    setLocalSkill(null);
    setOnboardingSkipped(false);
    if (!renderedOwner) return;
    let alive = true;
    AsyncStorage.multiGet([
      `chef-skill:${renderedOwner}`,
      `chef-onboarding-skipped:${renderedOwner}`,
    ]).then(([[, skill], [, skipped]]) => {
      if (!alive) return;
      setLocalSkill(skill);
      setOnboardingSkipped(skipped === "1");
    });
    return () => {
      alive = false;
    };
  }, [renderedOwner]);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem("chef-language").then((v) => {
      if (alive && v === "zh-TW") setLang(v);
    });
    async function accept(next: Session | null) {
      if (!alive) return;
      const id = next?.user.id || null;
      if (owner.current !== id) {
        const previous = owner.current;
        epoch.current++;
        owner.current = id;
        cookingLoaded.current = false;
        setHydrated(false);
        setSession(next);
        setProfile(null);
        setData({});
        setCooking(null);
        setPlannedRecipe(null);
        setPlanningChoices({ ...domain.defaultMealPlanningChoices });
        setError("");
        setBusy(false);
        const transition = epoch.current;
        await Notifications.cancelAllScheduledNotificationsAsync().catch(
          () => {},
        );
        if (previous) await AsyncStorage.removeItem(`chef-cooking:${previous}`);
        if (!alive || owner.current !== id || epoch.current !== transition)
          return;
        const e = transition;
        if (id) {
          const raw = await AsyncStorage.getItem(`chef-cooking:${id}`);
          if (alive && owner.current === id && epoch.current === e) {
            try {
              const value = raw ? JSON.parse(raw) : null;
              setCooking(persistableCooking(value));
            } catch {}
            cookingLoaded.current = true;
            setHydrated(true);
          }
        }
      }
      if (alive && owner.current === id) {
        setSession(next);
        setReady(true);
      }
    }
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) setError(error.message);
        void accept(data.session);
      })
      .catch((err) => {
        if (alive) {
          setError(err.message);
          setReady(true);
        }
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      setTimeout(() => void accept(next), 0);
      if (event === "PASSWORD_RECOVERY")
        Alert.alert(
          "Password recovery / 重設密碼",
          "Open Profile to set a new password. 請至個人設定更新密碼。",
        );
    });
    const receive = (url: string) =>
      handleAuthLink(url).catch((e) => setError(e.message));
    const link = Linking.addEventListener(
      "url",
      ({ url }) => void receive(url),
    );
    Linking.getInitialURL().then((url) => {
      if (url) void receive(url);
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
      link.remove();
    };
  }, []);
  useEffect(() => {
    if (session) void run(refresh);
  }, [session?.user.id]);
  useEffect(() => {
    if (!owner.current || !cookingLoaded.current) return;
    const state = persistableCooking(cooking);
    const key = `chef-cooking:${owner.current}`;
    void (state
      ? AsyncStorage.setItem(key, JSON.stringify(state))
      : AsyncStorage.removeItem(key));
  }, [cooking]);
  useEffect(() => {
    if (!session || !cookingLoaded.current || cooking) return;
    const active = (data.cooking_sessions || []).find(
      (row) =>
        row.status === "active" &&
        row.timeline?.mobile &&
        !ended.current.has(row.id),
    );
    if (active) {
      const restored = active.timeline.mobile;
      if (restored.recipe?.source_persistence !== "session_only")
        setCooking({ ...restored, cloudId: active.id });
    }
  }, [data.cooking_sessions, hydrated]);
  useEffect(() => {
    if (
      !session ||
      !cooking ||
      cooking.recipe.source_persistence === "session_only" ||
      !cookingLoaded.current
    )
      return;
    const id = renderedOwner,
      e = renderedEpoch,
      snapshot = cooking;
    cloudQueue.current = cloudQueue.current
      .catch(() => {})
      .then(async () => {
        guard(id, e);
        if (
          ending.current === snapshot.startedAt ||
          ended.current.has(snapshot.cloudId || "") ||
          currentCooking.current?.startedAt !== snapshot.startedAt
        )
          return;
        const recipeId = snapshot.recipe.saved_recipe_id;
        const validId =
          recipeId && (data.recipes || []).some((r) => r.id === recipeId)
            ? recipeId
            : null;
        const payload = {
          id: snapshot.cloudId,
          user_id: id,
          app_user_id: id,
          recipe_id: validId,
          status: "active",
          current_step: snapshot.step,
          timers: snapshot.timers,
          started_at: snapshot.startedAt,
          timeline: {
            activeRecipe: { ...snapshot.recipe, saved_recipe_id: validId },
            mobile: snapshot,
            savedAt: Date.now(),
          },
          updated_at: new Date().toISOString(),
        };
        requireOK(await supabase.from("cooking_sessions").upsert(payload));
        guard(id, e);
      })
      .catch((err) => {
        if (owner.current === id && epoch.current === e)
          setError(
            `Cooking is saved locally; cloud sync failed. 烹飪進度已保存於本機，雲端同步失敗。 ${err.message}`,
          );
      });
  }, [cooking]);
  async function endCooking(status = "abandoned") {
    const id = renderedOwner,
      e = renderedEpoch,
      snapshot = currentCooking.current;
    guard(id, e);
    if (!snapshot) return;
    ending.current = snapshot.startedAt;
    try {
      await cloudQueue.current.catch(() => {});
      guard(id, e);
      if (
        snapshot.cloudId &&
        snapshot.recipe.source_persistence !== "session_only"
      )
        requireOK(
          await supabase
            .from("cooking_sessions")
            .update({ status, completed_at: new Date().toISOString() })
            .eq("id", snapshot.cloudId)
            .eq("user_id", id),
        );
      guard(id, e);
      if (currentCooking.current?.startedAt !== snapshot.startedAt)
        throw new Error("Cooking session changed. Please retry.");
      if (snapshot.cloudId) ended.current.add(snapshot.cloudId);
      setCooking(null);
      await Notifications.cancelAllScheduledNotificationsAsync();
    } finally {
      if (ending.current === snapshot.startedAt) ending.current = null;
    }
  }
  const guardedCooking = (value: any) => {
    guard(renderedOwner, renderedEpoch);
    if (ending.current) return;
    setCooking(value);
  };
  async function run(action: () => Promise<any>) {
    const id = renderedOwner,
      e = renderedEpoch;
    setBusy(true);
    setError("");
    try {
      return await action();
    } catch (err: any) {
      if (owner.current === id && epoch.current === e)
        setError(err.message || String(err));
      return undefined;
    } finally {
      if (owner.current === id && epoch.current === e) setBusy(false);
    }
  }
  async function mutate(
    table: string,
    payload: Row,
    kind = "insert",
    id?: string,
  ) {
    const uid = renderedOwner,
      e = renderedEpoch;
    guard(uid, e);
    if (!uid) throw new Error("Sign in required");
    let query: any =
      kind === "insert"
        ? supabase.from(table).insert(payload)
        : kind === "upsert"
          ? supabase.from(table).upsert(payload)
          : kind === "delete"
            ? supabase.from(table).delete().eq("id", id!)
            : supabase.from(table).update(payload).eq("id", id!);
    if (kind === "delete" || kind === "update")
      query = query.eq(
        table === "app_profiles" ? "app_user_id" : "user_id",
        uid,
      );
    const result = await query.select();
    guard(uid, e);
    requireOK(result);
    await refresh();
    return result.data;
  }
  async function scoped(action: () => Promise<any>) {
    const id = renderedOwner,
      e = renderedEpoch;
    guard(id, e);
    const result = await action();
    guard(id, e);
    return result;
  }
  async function saveRecipe(recipe: Recipe) {
    if (recipe.source_persistence === "session_only")
      throw new Error(
        "This sourced recipe is session only. 此來源食譜僅限本次使用。",
      );
    if (recipe.saved_recipe_id) return recipe;
    const rows = await mutate("recipes", {
      user_id: renderedOwner,
      app_user_id: renderedOwner,
      title: recipe.title,
      servings: recipe.servings,
      minutes: recipe.minutes,
      recipe,
      nutrition: {
        estimate: {
          kcal: recipe.kcal,
          protein_g: recipe.protein_g,
          carbs_g: recipe.carbs_g,
          fat_g: recipe.fat_g,
        },
      },
      adaptations: recipe.substitutions || [],
      is_saved: true,
    });
    return { ...recipe, saved_recipe_id: rows[0].id };
  }
  async function signOut() {
    const result = await supabase.auth.signOut();
    requireOK(result);
  }
  return (
    <StoreContext.Provider
      value={{
        session,
        ready,
        profile,
        data,
        cooking,
        plannedRecipe,
        planningChoices,
        pendingPantryIdea,
        setPendingPantryIdea: (value: any) => {
          guard(renderedOwner, renderedEpoch);
          setPendingPantryIdea(value);
        },
        setPlannedRecipe: (value: any) => {
          guard(renderedOwner, renderedEpoch);
          setPlannedRecipe(value);
        },
        setPlanningChoices: (value: any) => {
          guard(renderedOwner, renderedEpoch);
          setPlanningChoices(value);
        },
        setCooking: guardedCooking,
        lang,
        setLang: (v: any) => {
          setLang(v);
          void AsyncStorage.setItem("chef-language", v);
        },
        busy,
        error,
        setError,
        run,
        refresh,
        mutate,
        scoped,
        saveRecipe,
        signOut,
        endCooking,
        edge: (n: string, b: Row) =>
          scoped(() =>
            edge(
              n,
              n === "chef-meal-plan" && (profile?.cooking_skill || localSkill)
                ? { ...b, cooking_skill: profile?.cooking_skill || localSkill }
                : b,
            ),
          ),
        cookingSkill: profile?.cooking_skill || localSkill,
        profileLoaded: Boolean(renderedOwner) && profileLoadedFor === renderedOwner,
        onboardingSkipped,
        skipOnboarding: () => {
          setOnboardingSkipped(true);
          if (renderedOwner)
            void AsyncStorage.setItem(`chef-onboarding-skipped:${renderedOwner}`, "1");
        },
        // Saves profile fields; cooking_skill also lives on the device and is
        // dropped from the row until the optional column is migrated.
        saveProfile: async (payload: Row) => {
          const skill = payload.cooking_skill;
          if (skill && renderedOwner) {
            setLocalSkill(skill);
            await AsyncStorage.setItem(`chef-skill:${renderedOwner}`, skill);
          }
          try {
            await mutate("app_profiles", payload, "upsert");
          } catch (error: any) {
            if (!("cooking_skill" in payload) || !/cooking_skill/.test(String(error?.message || "")))
              throw error;
            const { cooking_skill: _skill, ...rest } = payload;
            await mutate("app_profiles", rest, "upsert");
          }
        },
        userId: session?.user.id,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}
