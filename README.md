# enjaz-OP | إنجاز

منصة مفتوحة المصدر لإدارة مشاريع الفريق ومهامه، بواجهة عربية وإنجليزية. الترخيص: [MIT](LICENSE).

Projects, Kanban boards, multi-person assignments, approval workflow, personal tasks, recurring tasks, notifications and team roles. Built with Next.js, React, TypeScript and Drizzle.

## البدء السريع

تحتاج Node.js 22 وnpm. نزّل المستودع وافتح الطرفية **داخل مجلد المشروع** ثم:

```sh
npm ci
npm run setup
npm run dev
```

افتح http://localhost:3100/setup وأنشئ حساب المدير باسمك وبريدك وكلمة مرور من 8 أحرف على الأقل وتأكيدها. لا يوجد حساب أو كلمة مرور افتراضية. تُغلق صفحة الإعداد بعد إنشاء أول مستخدم. من «الفريق» أضف الموظفين، ثم أنشئ مشروعًا وأضف أعضاءه ومهامه.

أمر setup ينشئ `.env` بأسرار عشوائية خاصة بنسختك، ولا يغيّر ملفًا موجودًا. قاعدة محلية جديدة تُنشأ تلقائيًا في `.data/pglite` مع تطبيق الترحيلات. لا تحتاج حسابًا سحابيًا للتجربة. شغّل عملية واحدة فقط على هذه القاعدة.

- [دليل التشغيل والنشر الكامل بالعربية](docs/SETUP.ar.md)
- [Complete English setup guide](docs/SETUP.en.md)
- [المساهمة / Contributing](CONTRIBUTING.md)
- [الإبلاغ الأمني / Security](SECURITY.md)

## Quick start

Install Node.js 22, download or clone this repository, open its directory and run `npm ci`, `npm run setup`, then `npm run dev`. Visit http://localhost:3100/setup to create your administrator. There are no default credentials. Local storage and migrations are automatic. Use a separate Neon database for production; follow the complete guide above.

## المزايا

- مشاريع ومهام ولوحة سحب وإفلات وقوائم وتصفية وبحث.
- أدوار مدير نظام ومدير مشاريع وموظف، وعضوية وصلاحيات رؤية للمهام.
- مراجعة الإنجاز والتعليقات وقوائم التحقق وسجل النشاط.
- مهام شخصية خاصة بصاحبها، ومهام متكررة بجدولة خارجية.
- إشعارات داخلية وإشعارات أجهزة اختيارية، وقابلية التثبيت كتطبيق ويب.
- دعم العربية واتجاه RTL والإنجليزية.

## التطوير

```sh
npm run lint
npm run typecheck
npm run build
```

`src/app`: الصفحات، `src/components`: الواجهة، `src/lib/actions`: العمليات، `src/lib/queries`: القراءة، `src/lib/permissions.ts`: الصلاحيات، `src/db`: المخطط والاتصال، `drizzle`: ترحيلات قاعدة البيانات.

هذه نسخة مستقلة لا تتضمن بيانات مستخدمين أو أسرارًا أو تاريخ المستودع الأصلي. قاعدة الإنتاج المدعومة هي Neon عبر HTTP؛ رابط PostgreSQL عادي ليس بديلًا متوافقًا تلقائيًا. المكتبات الخارجية تحت تراخيصها الخاصة.

- [النشر على VPS: هوستنجر وغيره](docs/VPS.ar.md)
