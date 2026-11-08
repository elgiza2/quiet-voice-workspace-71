# Ceyo: Vercel and first Google Play upload

## Vercel
1. Import this repository in Vercel. Use Node 22 and Bun; install `bun install`, build `bun run build`. No SPA rewrites or manual output directory.
2. `VERCEL=1` selects Nitro's Vercel adapter in the existing config; Lovable keeps its managed adapter. Do not duplicate framework plugins.
3. Add server credentials in Vercel Environment Variables, never in Git or `VITE_*`: the current Supabase server credentials, payment credentials, voice/provider fallbacks, cron secret and signing credentials listed in `docs/service-credentials-inventory.md`. Names alone do not establish that the destination has them.
4. Set both `PUBLIC_APP_URL` and `APP_URL` to the stable HTTPS origin serving this deployment (web or Android). Configure Supabase Auth allowed redirect URLs and each provider webhook for the actual destination. Provider pool remains in the existing Supabase project; Edge Function secrets are not automatically available in Vercel.
5. Attach `web.ceyo.si` and `app.ceyo.si` to the app deployment. The landing site is separate and intentionally not built here.
6. Test login, chat, voice, integration authorization, signed payment settlement and background jobs on Vercel. No external deployment was performed in this pass. Fire-and-forget long jobs and production scheduling still require runtime verification; see README.
7. The platform manages `.gitignore`; ensure local `.env`, `.vercel`, Android build/cache files, `local.properties`, keystores and passwords are excluded before exporting/pushing outside Lovable. The clean delivery ZIP excludes them.

## Android project
- First upload package: `si.ceyo.app`, versionCode 1, versionName 1.0. Native shell: Capacitor 8, target/compile API 36, min API 24.
- `capacitor.config.ts` loads **https://app.ceyo.si** over HTTPS. This host must serve the app before users can use the Android shell. It is not a bundled offline copy of the web server.
- The native `CeyoPlayBilling` plugin opens Google Play subscriptions. Web-only Kashier/Dodo options are hidden inside the Capacitor Android app. Access is granted only by `/api/billing` verification, never by native/browser success alone.
- The first unsigned release AAB was compiled successfully. It contains the Play Billing dependency and permission; it cannot be uploaded until signed with the owner's upload key. No upload key was generated or exported, and no Google Play approval is promised.
- Capacitor's microphone/camera handling is used; background incoming-call services/push from `android-bridge.md` are not implemented in this first wrapper.

## Sign and upload (Arabic quick steps)
1. ثبّت Android Studio، وافتح مجلد `android`، وثبّت Android SDK 36 عند الطلب. من جذر المشروع شغّل `bun install` ثم `bunx cap sync android` قبل فتح Android Studio.
2. اختر **Build → Generate Signed App Bundle / APK → Android App Bundle**.
3. اضغط **Create new** لإنشاء Upload key عندك. احفظ ملف المفتاح وكلمة مروره خارج المشروع، وخذ نسخة احتياطية آمنة؛ لا تبعت كلمة المرور في الشات.
4. اختر release وأكمل. الملف الناتج `android/app/release/app-release.aab` (أو مسار Android Studio الذي يعرضه) هو الملف الموقّع الذي ترفعه؛ الملف المرفق هنا غير موقّع.
5. في Play Console: **Test and release → Testing → Internal testing → Create new release**، فعّل Play App Signing وارفع الملف الموقّع. استكمل إقرارات التطبيق التي يطلبها Google.
6. بعد أول رفع يتضمن Billing، أنشئ subscriptions: `ceyo_plus_monthly`, `ceyo_plus_yearly`, `ceyo_pro_monthly`, `ceyo_ultra_monthly` مع base plan فعال لكل منتج.
7. أضف Google Play service-account JSON إلى مدير أسرار الاستضافة باسم `GOOGLE_PLAY_SERVICE_ACCOUNT`، واسم الحزمة `GOOGLE_PLAY_PACKAGE_NAME=si.ceyo.app`؛ أعطِ حساب الخدمة صلاحيات شراء/اشتراكات التطبيق في Play Console. لا تحط JSON في تطبيق أندرويد.
8. الشراء الفعلي والاستعادة والإلغاء والتجديد وتأكيد المشتريات تحتاج اختبارًا على جهاز من مسار Internal testing؛ لا تعتبر أول AAB نظام اشتراكات إنتاجي مكتملًا. يلزم إكمال acknowledgment/restore والتجديد قبل البيع العام.

## Verification in this pass
Release compilation succeeded with Gradle and API 36. Automated payment/settings tests and notifier cleanup regression are run separately. The web interface is reviewed using isolated actual components; no signed-in external account or real payment was verified. The generated AAB is unsigned and the configured host has not been verified live.

## Google sign-in — exact production setup
Observed 2026-11-08: the public app opens on all three domains; the production Google button returns `Unsupported provider: provider is not enabled`. This is provider configuration, not evidence of a server outage.

In Google Cloud Console → Google Auth Platform:
- Branding authorized domain: `ceyo.si`. Home page `https://ceyo.si`; privacy `https://ceyo.si/privacy`; terms `https://ceyo.si/terms`. Verify the legal pages before submitting consent/store review.
- OAuth client type: **Web application** for the browser Supabase flow.
- Authorized JavaScript origins: `https://web.ceyo.si`, `https://app.ceyo.si`; add `https://ceyo.si` and `https://www.ceyo.si` only while root-domain login remains active.
- Authorized redirect URI (Google → Supabase): **`https://kcrssdgsefhpzoidlhhm.supabase.co/auth/v1/callback`**. This is not the app's return URL.
- Scopes: `openid`, email, profile. Enable the Google provider in the existing Supabase project using that client's ID and secret; never commit the secret.

Supabase → Authentication → URL Configuration:
- Site URL: `https://web.ceyo.si`.
- Redirect allowlist: `https://web.ceyo.si/auth**`, `https://app.ceyo.si/auth**`.
- Temporary root-domain login: `https://ceyo.si/auth**`, `https://www.ceyo.si/auth**`.
- Preview, if needed: `https://id-preview--c87dc9b3-8252-409e-955f-fb7fa040419b.lovable.app/auth**`.
- The app returns to `/auth?oauth=1&redirect=...` and verifies the session before navigation. Existing profile creation remains authoritative.

Native Android Google sign-in is a separate release blocker: Google's authorization page must not run inside an embedded WebView. Complete system-browser/native Google authentication with a verified app return before store testing; record Play App Signing SHA-1/SHA-256 when configuring an Android OAuth client. Browser-only success does not verify the Android flow.

## Owner inputs for the store release
- Play Console application access/setup and confirmation of package `si.ceyo.app` (keep stable after upload).
- Subscription product IDs, active base-plan IDs, prices and periods for every offered tier; the server currently expects `ceyo_<tier>_<interval>`.
- Play service-account authorization for server-side purchase checks; submit its JSON through secure configuration, never chat or Git.
- Owner-generated upload key kept locally; send only the public certificate fingerprints, not keystore/password/private key.
- Store name, descriptions, icon/screenshots, support contact, live privacy/account-deletion page, Data Safety and content-rating declarations.
- An Android device and license tester for Internal testing. Complete purchase acknowledgment, restore, cancellation and renewal before selling publicly.

## Telegram administration release blockers
The current bot covers three providers only, and key intake still accepts chat messages into plaintext server-only rows. Do not activate that intake for production credentials. Telegram must launch protected credential entry backed by encrypted storage, with explicit operator IDs, safe metadata-only status views and provider-specific consumers. Pair payment/account identifiers with their original merchant/project credentials; rotating unrelated merchant or project keys can invalidate existing payments, calls or linked accounts. Missing `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` in the hosting runtime blocks Vault and pool access even when those secrets exist in Supabase Edge settings. Full all-service distribution remains incomplete until secure intake, provider coverage and live failure/restore verification are finished.