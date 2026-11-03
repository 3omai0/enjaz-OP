# نشر إنجاز على VPS: هوستنجر أو أي مزود

هذا الدليل لخادم Ubuntu 24.04 جديد تملك صلاحية sudo عليه، ودومين تملكه. التطبيق على VPS وقاعدة البيانات في حساب Neon الخاص بك؛ لا يستخدم أي قاعدة لمؤلف المشروع. تثبيت PostgreSQL على الخادم نفسه غير مدعوم بمشغل الاتصال الحالي، ويحتاج تطويرًا إضافيًا. اختر نظام Ubuntu عاديًا لهذا الدليل؛ إذا اخترت قالب CloudPanel أو OpenLiteSpeed فاستخدم أدوات القالب لإدارة المواقع والمنافذ بدل تثبيت Nginx فوقه.

## 1. تجهيز الخادم والدومين

من لوحة VPS انسخ عنوان IP وبيانات SSH. سجّل الدخول من جهازك:

```sh
ssh root@YOUR_SERVER_IP
```

يمكن أيضًا الدخول بحساب sudo بدل root. في DNS أضف سجل A باسم app إلى IP الخادم (ليصبح app.your-domain.example). استبدل هذا الدومين في جميع الأمثلة بدومينك. لا تضف AAAA إلا إذا كان IPv6 يعمل ويشير إلى الخادم نفسه.

ثبّت الأدوات:

```sh
sudo apt update
sudo apt install -y nginx git curl ca-certificates apache2-utils certbot python3-certbot-nginx
sudo adduser injaz
```

ثبّت Node.js **22** مع npm على مستوى النظام من [تعليمات Node.js](https://nodejs.org/en/download)، باختيار Linux والإصدار 22. استخدم مسارًا ثابتًا متاحًا لمستخدم الخدمة، ولا تعتمد على تفعيل بيئة shell تفاعلية. تحقق:

```sh
node --version
npm --version
command -v node
command -v npm
```

ملف الخدمة أدناه يفترض أن npm موجود في `/usr/bin/npm`؛ عدّله إذا اختلف المسار، وأضف مجلد node إلى PATH في الخدمة عند الحاجة. اسمح بمنافذ SSH و80 و443 في جدار حماية مزود VPS، ولا تفتح 3100. إن كنت تستخدم UFW اسمح بمنفذ SSH الفعلي قبل تفعيله حتى لا ينقطع وصولك.

## 2. تنزيل النسخة وإعداد قاعدة مستقلة

انتقل إلى حساب التطبيق:

```sh
sudo -iu injaz
```

ثم نفّذ (استبدل رابط المستودع برابط نسختك):

```sh
git clone https://github.com/3omai0/enjaz-OP.git app
cd /home/injaz/app
npm ci
npm run setup
nano .env
```

أنشئ مشروعًا وقاعدة جديدة في حسابك على Neon، وانسخ رابط Connect إلى DATABASE_URL. احتفظ بـ AUTH_SECRET وCRON_SECRET اللذين ولدهما setup، واضبط المنطقة الزمنية ومتغيرات الإشعارات إن رغبت. لا تستخدم رابط قاعدة أي شخص آخر. التفاصيل في [دليل الإعداد](SETUP.ar.md).

```sh
chmod 600 .env
npm run db:migrate
npm run build
exit
```

لا تستخدم npm run dev في النشر. إذا نفدت الذاكرة أثناء البناء، زد ذاكرة الخادم أو ابنِ في بيئة Linux متوافقة ثم انقل الناتج مع الملفات المطلوبة؛ لا تنقل node_modules من Windows إلى Linux.

## 3. خدمة تشغيل دائمة

ارجع إلى حساب sudo، وأنشئ `/etc/systemd/system/injaz.service`:

```ini
[Unit]
Description=Injaz project management
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=injaz
Group=injaz
WorkingDirectory=/home/injaz/app
Environment=NODE_ENV=production
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/bin/npm run start -- --hostname 127.0.0.1
Restart=on-failure
RestartSec=5
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

Next.js يقرأ `.env` من مجلد العمل؛ لا تكتب الأسرار في ملف الخدمة. شغّلها:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now injaz
sudo systemctl status injaz
```

التطبيق يستمع محليًا على 127.0.0.1:3100، ويعيد systemd تشغيله عند التعطل وبعد إعادة تشغيل الخادم.

## 4. Nginx وHTTPS وإنشاء المدير

احمِ أول تشغيل بكلمة مرور مؤقتة حتى لا ينشئ زائر آخر حساب المدير قبلك:

```sh
sudo htpasswd -c /etc/nginx/injaz-bootstrap bootstrap
```

أنشئ `/etc/nginx/sites-available/injaz`:

```nginx
server {
    listen 80;
    server_name app.your-domain.example;

    auth_basic "Initial setup";
    auth_basic_user_file /etc/nginx/injaz-bootstrap;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
    }
}
```

فعّل الموقع بعد تعديل الدومين:

```sh
sudo ln -s /etc/nginx/sites-available/injaz /etc/nginx/sites-enabled/injaz
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d app.your-domain.example
sudo certbot renew --dry-run
```

إذا كان رابط التفعيل موجودًا بالفعل لا تعد إنشاؤه. يجب أن يصل الدومين إلى الخادم وأن يكون المنفذ 80 متاحًا لإصدار الشهادة. اتبع تعليمات Certbot لتحويل الزيارات إلى HTTPS.

افتح `https://app.your-domain.example/setup`، أدخل حماية bootstrap ثم أنشئ مديرك باسمه وبريده وكلمة مروره. بعد النجاح احذف سطري auth_basic وauth_basic_user_file من إعداد الموقع، ثم `sudo nginx -t` و`sudo systemctl reload nginx`. تحقق من أن /setup لم يعد يسمح بإنشاء مدير جديد، ومن تسجيل الدخول وإضافة مشروع ومهمة. إعدادات إنتاج ملفات الارتباط تتطلب HTTPS.

## 5. تشغيل المهام المتكررة كل دقيقة

ملف vercel.json لا يشغّل شيئًا على VPS. بعد إتمام إعداد المدير وإزالة حماية bootstrap، ادخل بحساب injaz وأنشئ `/home/injaz/recurring-curl.conf` بالمحتوى التالي، مستبدلًا السر بقيمة CRON_SECRET من .env:

```text
url = "http://127.0.0.1:3100/api/cron/recurring"
header = "Authorization: Bearer YOUR_CRON_SECRET"
fail
silent
show-error
max-time = 50
```

ثم:

```sh
chmod 600 /home/injaz/recurring-curl.conf
curl --config /home/injaz/recurring-curl.conf
crontab -e
```

أضف السطر:

```cron
* * * * * /usr/bin/curl --config /home/injaz/recurring-curl.conf >/dev/null 2>&1
```

تأكد أن خدمة cron مثبتة ومفعّلة على خادمك (`sudo apt install cron` و`sudo systemctl enable --now cron` من حساب sudo). عند التشخيص شغّل curl يدويًا لعرض الأخطاء. ملف إعداد curl خارج المستودع وصلاحياته لصاحبه فقط؛ إذا غيرت CRON_SECRET حدّثه أيضًا. أنشئ مهمة متكررة تجريبية وتحقق من ظهورها في موعدها.

## 6. المتابعة والتحديث

من حساب sudo:

```sh
sudo systemctl status injaz
sudo journalctl -u injaz -n 100 --no-pager
sudo tail -n 100 /var/log/nginx/error.log
```

خطأ 502 عادة يعني أن خدمة التطبيق متوقفة أو أن المنفذ لا يطابق إعداد الوكيل. أخطاء الاتصال بالقاعدة تستدعي فحص DATABASE_URL والشبكة والترحيلات. تأكد من إمكانية اتصال الخادم بـ Neon عبر HTTPS.

قبل تحديث النسخة خذ نسخة احتياطية من قاعدة Neon ومن .env في مكان آمن، واقرأ تغييرات الترحيلات. لتحديث بسيط مع توقف مؤقت:

```sh
sudo systemctl stop injaz
sudo -iu injaz
cd /home/injaz/app
git pull --ff-only
npm ci
npm run db:migrate
npm run build
exit
sudo systemctl start injaz
```

نفّذ الخطوات واحدة واحدة وتوقف عند أي خطأ؛ لا تبدأ الخدمة ببناء فاشل. اختبر الصفحة وتسجيل الدخول والمهمة والجدولة بعد التحديث. الرجوع إلى كود قديم بعد تغيير المخطط قد يتطلب استعادة قاعدة البيانات أيضًا.

## مصادر

- [الاستضافة الذاتية في Next.js](https://nextjs.org/docs/app/guides/self-hosting)
- [خيارات استضافة Node.js لدى Hostinger](https://www.hostinger.com/support/node-js-hosting-options-at-hostinger/)
- [تنزيل Node.js](https://nodejs.org/en/download)

أُعد هذا الدليل للنسخة الحالية؛ لم يُنفذ نشر فعلي على VPS ضمن تجهيز النسخة.
