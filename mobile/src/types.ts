export type Ingredient = {
  name: string;
  quantity: number;
  unit: string;
  preparation?: string;
  category?: string;
  usda_query?: string;
};
export type RecipeStep = {
  instruction: string;
  timers: { label: string; duration_seconds: number; kind: string }[];
};
export type Recipe = {
  title: string;
  summary?: string;
  servings: number;
  minutes: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  ingredients: Ingredient[];
  steps: RecipeStep[];
  substitutions?: any[];
  equipment_adaptations?: any[];
  reuse_ideas?: any[];
  image?: {
    url: string;
    description_url: string;
    creator: string;
    license: string;
    match_kind: string;
  };
  source_persistence?: string;
  source_url?: string;
  source_title?: string;
  source_provider?: string;
  source_type?: string;
  import_estimates?: { ingredients: number[]; steps: number[] };
  fallback?: boolean;
  saved_recipe_id?: string;
  nutrition_stale?: boolean;
  usda_nutrition?: any;
};
export type Timer = {
  mode?: string;
  id: string;
  label: string;
  remaining: number;
  deadline: number | null;
  notificationId?: string;
  duration?: number;
};
export type Cooking = {
  pantryChanges?: any[];
  pantryApplied?: boolean;
  recipe: Recipe;
  step: number;
  timers: Timer[];
  startedAt: string;
  logId?: string;
  feedbackId?: string;
  cloudId?: string;
};
export type Row = Record<string, any>;
