# Chef Jarvis Privacy and Data Retention

Last updated: 2026-07-18

Chef Jarvis stores the account and product data needed to personalize recipes
and preserve your work. This may include your email-based account, cooking
profile, nutrition targets, dietary preferences and allergies, pantry,
recipes, shopping lists, meal plans, cooking sessions, nutrition logs, and
recipe feedback.

## Retention and deletion

User-owned product data is retained until you delete your account. Choosing
**Delete my account** in Profile permanently deletes the Supabase Auth user and
the Chef Jarvis product rows linked to that account. This cannot be undone.

Short-lived request records used only for service rate limiting age out
automatically. They are also linked to the account and deleted with it.

JSON files downloaded through **Download my data** are stored wherever you
choose to save them. Chef Jarvis cannot remove copies from your device or from
other services where you upload them.

## External services

Chef Jarvis sends the minimum information needed to provide a requested
feature to its service providers:

- Supabase provides authentication, database storage, and server functions.
- Google Gemini may receive the meal request and relevant food-profile context
  when you ask Chef Jarvis to generate a plan.
- USDA FoodData Central may receive ingredient search terms when you request
  nutrition references.
- Wikimedia Commons may receive ordinary image requests when a recipe image is
  displayed.

Do not enter secrets or unrelated sensitive personal information in a meal
request.

## Your choices

You can download a machine-readable JSON export before deletion. You can also
delete individual saved recipes, shopping lists, pantry items, and other
content through the product where those controls are available.
