# Ceyo — first Google Play listing draft

## Identity
- App name: **Ceyo**
- Package: **si.ceyo.app**
- Developer: **Megsy LLC** (existing project identity).
- Support: **support@ceyo.si** (existing project mailbox; receiving mail has not been verified).
- Website: https://web.ceyo.si
- Privacy: https://web.ceyo.si/privacy
- Terms: https://web.ceyo.si/terms

## العربية
الوصف المختصر: مساعدك الذكي للمحادثات وتنظيم المهام، مع مكالمات صوتية وفيديو.

الوصف الكامل:
Ceyo مساحة شخصية للتحدث مع مساعدك الذكي ومتابعة أعمالك من مكان واحد.

أنشئ مساعدين يناسبون احتياجاتك، واحتفظ بمحادثاتك، ونظّم العمل في مجموعات تجمع الأشخاص والمساعدين. استخدم المحادثة النصية أو المكالمات الصوتية والفيديو حسب توافر الخدمة، واحفظ ملاحظاتك ومستنداتك للرجوع إليها.

تتوافر حصة استخدام مجانية صغيرة تتجدد يوميًا، مع اشتراكات اختيارية Plus وPro وUltra. شراء الاشتراكات داخل تطبيق أندرويد يتم عبر Google Play فقط، ويمكن إدارة الاشتراك وإلغاؤه من حساب Google Play.

يتطلب التطبيق اتصالًا بالإنترنت وحسابًا. قد تخطئ إجابات الذكاء الاصطناعي؛ راجع المعلومات المهمة قبل الاعتماد عليها. الميكروفون والكاميرا يُستخدمان عند اختيار المكالمات ومنح الإذن.

للدعم: support@ceyo.si

## English
Short description: Your AI workspace for conversations, tasks, voice and video calls.

Full description:
Ceyo brings your personal AI assistants and conversations together in one workspace.

Create assistants for your needs, keep your conversations, and organize groups with people and assistants. Chat by text or use voice and video calls when services are available. Keep notes and documents for future conversations.

A small free allowance renews daily. Optional Plus, Pro and Ultra subscriptions are available. Android in-app subscription purchases use Google Play only. Manage or cancel your subscription through your Google Play account.

Ceyo requires an internet connection and an account. AI answers can be inaccurate; verify important information. Microphone and camera permissions are used when you choose calling features.

Support: support@ceyo.si

## Subscription catalogue — existing prices, not new invented prices
| Name | Product ID | Period | USD reference price | Suggested base-plan ID |
|---|---|---|---|---|
| Ceyo Plus | ceyo_plus_monthly | Monthly | 20 | monthly |
| Ceyo Plus Annual | ceyo_plus_yearly | Yearly | 199 | yearly |
| Ceyo Pro | ceyo_pro_monthly | Monthly | 60 | monthly |
| Ceyo Ultra | ceyo_ultra_monthly | Monthly | 120 | monthly |

Create and activate these four products in Play Console after the first bundle upload. Google Play sets final country prices/taxes. Do not offer Pro/Ultra yearly: the app does not sell those combinations.

## Release gate — do not describe the bundle as upload-ready
- The supplied bundle is **unsigned**. Android project rules keep upload keys on the owner's machine, outside source and deliverables. Sign locally with an owner-held upload key and enable Play App Signing.
- Publish the current app build at app.ceyo.si, including /auth/native-return. Allow https://app.ceyo.si/auth/native-return in Supabase Auth redirect URLs. Browser OAuth uses the existing Google Web client, PKCE, and a system browser; no OAuth client secret belongs in the Android app.
- Configure GOOGLE_PLAY_SERVICE_ACCOUNT securely on the hosting server with authorized Play Console access, and GOOGLE_PLAY_PACKAGE_NAME=si.ceyo.app. This credential must be issued by Google, not invented.
- Purchase acknowledgment, restore and renewal reconciliation remain incomplete; do not enable public sales before those paths pass actual Internal testing.
- Test Google login, purchases and calls on a physical Android device. Neither compilation nor browser tests prove these work on-device.
- Complete Data Safety, content rating, account-deletion URL and store screenshots with truthful declarations. The developer's Play Console access and mailbox operation were not verified here.