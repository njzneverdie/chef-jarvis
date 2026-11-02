import React from "react";
import { Text, View } from "react-native";
import { Button, Card, Copy, s, useT } from "./ui";
import { domain, useStore } from "./store";
import { requireOK, supabase } from "./client";
export function PantryUse() {
  const st = useStore(),
    t = useT(),
    c = st.cooking;
  if (!c || c.recipe.source_persistence === "session_only") return null;
  function preview() {
    const changes = domain
      .mergeGroceryItems(c.recipe.ingredients)
      .flatMap((ingredient: any) => {
        const item = (st.data.pantry_items || []).find(
          (row: any) =>
            row.name.trim().toLowerCase() ===
            ingredient.name.trim().toLowerCase(),
        );
        if (!item || !item.unit || !Number.isFinite(Number(item.quantity)))
          return [];
        const used = domain.convertQuantity(
          ingredient.quantity,
          ingredient.unit,
          item.unit,
        );
        if (used == null || used <= 0) return [];
        return [
          {
            id: item.id,
            name: item.name,
            unit: item.unit,
            before: Number(item.quantity),
            after: Math.max(
              0,
              Math.round((Number(item.quantity) - used) * 1e6) / 1e6,
            ),
            applied: false,
          },
        ];
      });
    st.setCooking({ ...c, pantryChanges: changes });
  }
  async function apply(item: any, undo = false) {
    const before = undo ? item.after : item.before,
      after = undo ? item.before : item.after;
    await st.scoped(async () => {
      const current = requireOK(
        await supabase
          .from("pantry_items")
          .select("quantity,name,unit")
          .eq("id", item.id)
          .eq("user_id", st.userId)
          .single(),
      ).data;
      if (!current || current.name !== item.name || current.unit !== item.unit)
        throw new Error(
          t(
            "This ingredient changed. Check your pantry before continuing.",
            "此食材已變更，請先檢查食材庫。",
          ),
        );
      if (Number(current.quantity) === after) return;
      if (Number(current.quantity) !== before)
        throw new Error(
          t(
            "Quantity changed. Update this ingredient manually to avoid overwriting another edit.",
            "份量已變更，請手動調整此食材，避免覆蓋其他編輯。",
          ),
        );
      const result = requireOK(
        await supabase
          .from("pantry_items")
          .update({ quantity: after })
          .eq("id", item.id)
          .eq("user_id", st.userId)
          .eq("quantity", before)
          .eq("name", item.name)
          .eq("unit", item.unit)
          .select("id"),
      );
      if (!result.data?.length)
        throw new Error(
          t("Pantry changed during the update.", "更新時庫存已變更。"),
        );
    });
    st.setCooking((current: any) =>
      current?.startedAt === c.startedAt
        ? {
            ...current,
            pantryChanges: current.pantryChanges.map((row: any) =>
              row.id === item.id ? { ...row, applied: !undo } : row,
            ),
          }
        : current,
    );
    await st.refresh();
  }
  return (
    <Card>
      <Text style={s.title}>
        {t("Update pantry after cooking", "料理後更新庫存")}
      </Text>
      <Copy>
        {t(
          "Review the whole-recipe ingredient use. Apply one ingredient at a time; each can be undone before ending cooking. Only matching names and compatible units are used.",
          "先確認整份食譜的食材用量，逐項扣除；結束烹飪前可逐項復原。僅配對相同名稱與可換算單位。",
        )}
      </Copy>
      {c.pantryChanges?.map((item: any) => (
        <View key={item.id} style={{ gap: 10 }}>
          <Copy>
            {item.name} · {item.before} → {item.after} {domain.unitLabel(item.unit, st.lang, item.after)}
          </Copy>
          <Button
            quiet
            disabled={st.busy || item.before === item.after}
            title={
              item.applied
                ? t("Undo this ingredient", "復原此食材")
                : t("Deduct this ingredient", "扣除此食材")
            }
            onPress={() => st.run(() => apply(item, !!item.applied))}
          />
        </View>
      ))}
      {c.pantryChanges?.length === 0 && (
        <Copy>
          {t(
            "No exact pantry matches. You can edit inventory manually.",
            "沒有完全配對的庫存，可自行編輯食材庫。",
          )}
        </Copy>
      )}
      {!c.pantryChanges && (
        <Button
          quiet
          title={t("Preview ingredient use", "預覽食材扣除")}
          onPress={preview}
        />
      )}
    </Card>
  );
}
