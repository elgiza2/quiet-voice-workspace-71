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

## عرض أول شهر — 50٪ فقط
للمشترك الذي لم يسبق له امتلاك أي اشتراك في التطبيق، على الباقات الشهرية فقط:
| الاشتراك | أول شهر بالدولار المرجعي | الشهر الثاني وما بعده |
|---|---|---|
| Plus | 10 | 20 كل شهر |
| Pro | 30 | 60 كل شهر |
| Ultra | 60 | 120 كل شهر |

- النوع: اشتراك auto-renewing، وليس منتجًا لمرة واحدة.
- Base plan: monthly، مدة P1M.
- Offer ID: first-month-half؛ الأهلية New customer acquisition → Never had any subscription in this app.
- مرحلة عرض واحدة: P1M، recurrenceCount=1، خصم نسبي 50٪. بعدها Google Play يرجع تلقائيًا لسعر الباقة المتكرر الكامل.
- السنوي Plus يبقى 199 دولارًا سنويًا؛ لا خصم أول شهر عليه. شاشة Google Play تعرض السعر المحلي والضرائب والأهلية قبل التأكيد.
- لم تُنشأ المنتجات داخل Play Console بعد؛ لا توجد صلاحية حساب خدمة مُهيأة هنا.

## إنشاء المنتجات من بيئة المشغل
scripts/configure-play-products.ts يعتمد كتالوج التطبيق، ويُنشئ المنتجات والـbase plans والعروض من خلال Android Publisher API الرسمي.
1. امنح حساب خدمة Google صلاحية إدارة منتجات التطبيق في Play Console وفعّل Google Play Android Developer API.
2. احفظ ملف JSON الذي أصدرته Google في GOOGLE_PLAY_SERVICE_ACCOUNT عبر النموذج الآمن، لا في الشات أو Git.
3. bun scripts/configure-play-products.ts يعرض إعدادات مقترحة فقط، دون أي تغيير خارجي.
4. bun scripts/configure-play-products.ts --apply ينشئ مسودات المنتجات والعروض. لا يمسح أو يغيّر إعدادًا موجودًا مختلفًا.
5. راجع البلدان والأسعار المحلية ثم شغّل --apply --activate للتفعيل. تغيير الأسعار والعرض الموجودين ليس تلقائيًا.
6. اختبر عملية الشراء والتجديد الفعليين في Internal testing؛ تكوين المنتجات وحده لا يصلح فجوات acknowledgment/restore/renewal.

## Release gate — do not describe the bundle as upload-ready
- The updated bundle is signed using the same owner-backed-up upload key, versionCode 2 / versionName 1.0.1. Enable Play App Signing. Signing does not activate products or verify payments.
- Publish the current app build at app.ceyo.si, including /auth/native-return. Allow https://app.ceyo.si/auth/native-return in Supabase Auth redirect URLs. Browser OAuth uses the existing Google Web client, PKCE, and a system browser; no OAuth client secret belongs in the Android app.
- Configure GOOGLE_PLAY_SERVICE_ACCOUNT securely on the hosting server with authorized Play Console access, and GOOGLE_PLAY_PACKAGE_NAME=si.ceyo.app. This credential must be issued by Google, not invented.
- Purchase acknowledgment, restore and renewal reconciliation remain incomplete; do not enable public sales before those paths pass actual Internal testing.
- Test Google login, purchases and calls on a physical Android device. Neither compilation nor browser tests prove these work on-device.
- Complete Data Safety, content rating, account-deletion URL and store screenshots with truthful declarations. The developer's Play Console access and mailbox operation were not verified here.