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


## iOS voice and local storage (October 30, 2026)

Voice commands are optional. With permission, Apple speech recognition may process audio. Chef Jarvis retains no audio recording and sends no audio to its backend. iOS Settings controls microphone/speech permission. Sessions use Keychain; eligible cooking progress and language use local app storage; alerts use local notifications. Source-only recipes stay in memory. Sign-out clears local cooking progress and alarms. Exported data is controlled by the user and selected share destination.

## Video recipe import (November 2, 2026)

When you import a cooking video, Chef Jarvis keeps only the video link and the
recipe it writes from that video in your saved recipes. YouTube links are sent
to Google Gemini, which reads the public video. Instagram does not let apps
read Reels, so you either paste the post caption, which is sent to Gemini as
text, or choose a video you saved yourself. A chosen video is uploaded to a
private Supabase storage folder only you can write to, sent to Gemini for
analysis, and then deleted from Supabase and from Gemini. Any copy left by an
interrupted import is removed on your next import or when you delete your
account. Chef Jarvis never re-publishes the video.

If you give Chef Jarvis full Photos access, then while you import an Instagram
link the iOS app looks at the dates of your five newest videos to find one
saved in the last 10 minutes (for example with Instagram's Download) and
imports that video the same way. Nothing else in your photo library is read or
uploaded. With limited or no access, you choose the video yourself.
