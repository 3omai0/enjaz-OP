/**
 * Demo seed: creates the first administrator plus a small realistic workspace
 * so the system can be explored right away.
 *
 *   npm run db:seed
 *
 * It only runs on an EMPTY database (no users, no projects) and never touches
 * existing data. Every account gets a random password, printed once at the
 * end; set SEED_ADMIN_EMAIL / SEED_ADMIN_NAME / SEED_ADMIN_PASSWORD to choose
 * the administrator's details. In local (PGlite) mode stop the dev server
 * first, the embedded database cannot be opened by two processes at once.
 */
import { config } from "dotenv";
import { randomBytes } from "node:crypto";

config({ path: ".env.local" });
config();

/** 12 characters from a URL-safe alphabet: easy to copy, hard to guess. */
const randomPassword = () => randomBytes(9).toString("base64url");

async function main() {
  // Imported after the environment is loaded so DATABASE_URL is seen.
  const { count, eq } = await import("drizzle-orm");
  const { getDb, isNeon } = await import("./index");
  const { activities, checklistItems, comments, labels, notifications, projectMembers, projects, taskAssignees, taskLabels, tasks, users } = await import("./schema");
  const { hashPassword } = await import("../lib/auth/password");
  const { todayISO } = await import("../lib/format");
  const { taskHref } = await import("../lib/routes");
  type NewTask = typeof tasks.$inferInsert;

  const db = await getDb();
  console.log(isNeon ? "Seeding Neon Postgres..." : `Seeding local PGlite database (${process.env.PGLITE_DIR?.trim() || ".data/pglite"})...`);

  const [{ n: userCount }] = await db.select({ n: count() }).from(users);
  const [{ n: projectCount }] = await db.select({ n: count() }).from(projects);
  if (userCount > 0 || projectCount > 0) {
    console.log("The database already has data, so nothing was changed. The seed only fills an empty database.");
    return;
  }

  const credentials: Array<{ name: string; email: string; password: string; role: string }> = [];

  // 1. Administrator
  const adminEmail = (process.env.SEED_ADMIN_EMAIL?.trim() || "admin@example.com").toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD?.trim() || randomPassword();
  const adminName = process.env.SEED_ADMIN_NAME?.trim() || "Demo Admin";
  const [admin] = await db
    .insert(users)
    .values({ name: adminName, email: adminEmail, passwordHash: await hashPassword(adminPassword), role: "admin", jobTitle: "المدير التنفيذي", department: "الإدارة" })
    .returning();
  credentials.push({ name: adminName, email: adminEmail, password: adminPassword, role: "admin" });

  // 2. Demo employees, each with their own random password
  const demo = [
    { name: "سارة العتيبي", email: "sara@example.com", role: "manager" as const, jobTitle: "مديرة مشاريع", department: "إدارة المشاريع" },
    { name: "محمد الحربي", email: "mohammed@example.com", role: "member" as const, jobTitle: "مطوّر واجهات", department: "التطوير" },
    { name: "نورة القحطاني", email: "noura@example.com", role: "member" as const, jobTitle: "مصممة تجربة مستخدم", department: "التصميم" },
    { name: "فهد الشمري", email: "fahad@example.com", role: "member" as const, jobTitle: "مطوّر خلفية", department: "التطوير" },
  ];
  const people = [];
  for (const person of demo) {
    const password = randomPassword();
    const [row] = await db
      .insert(users)
      .values({ ...person, passwordHash: await hashPassword(password) })
      .returning();
    people.push(row);
    credentials.push({ name: person.name, email: person.email, password, role: person.role });
  }
  const [sara, mohammed, noura, fahad] = people;
  // Shown right away, so the passwords are not lost if a later step fails.
  console.log("Accounts (shown only now, keep them somewhere safe):");
  console.table(credentials);

  // 3. Projects, members and labels
  const [orders, app] = await db
    .insert(projects)
    .values([
      {
        name: "منصة الطلبات",
        key: "ORD",
        description: "بناء منصة طلبات متكاملة للعميل: لوحة تحكم، بوابة دفع، وتقارير لحظية.",
        status: "active",
        color: "#8554eb",
        startDate: todayISO(-20),
        dueDate: todayISO(40),
        ownerId: sara.id,
      },
      {
        name: "تطبيق الفريق للجوال",
        key: "APP",
        description: "تطبيق iOS و Android لعملاء الفريق مع إشعارات فورية وتتبع الطلبات.",
        status: "planning",
        color: "#33177e",
        startDate: todayISO(5),
        dueDate: todayISO(90),
        ownerId: admin.id,
      },
    ])
    .returning();

  await db.insert(projectMembers).values([
    { projectId: orders.id, userId: sara.id, role: "lead" },
    { projectId: orders.id, userId: admin.id, role: "member" },
    { projectId: orders.id, userId: mohammed.id, role: "member" },
    { projectId: orders.id, userId: noura.id, role: "member" },
    { projectId: orders.id, userId: fahad.id, role: "member" },
    { projectId: app.id, userId: admin.id, role: "lead" },
    { projectId: app.id, userId: sara.id, role: "member" },
    { projectId: app.id, userId: noura.id, role: "member" },
  ]);

  const labelRows = await db
    .insert(labels)
    .values([
      { projectId: orders.id, name: "واجهة", color: "#8554eb" },
      { projectId: orders.id, name: "خلفية", color: "#0e7490" },
      { projectId: orders.id, name: "خطأ", color: "#dc2626" },
      { projectId: orders.id, name: "تصميم", color: "#be185d" },
      { projectId: app.id, name: "iOS", color: "#33177e" },
      { projectId: app.id, name: "Android", color: "#15803d" },
    ])
    .returning();
  const label = (name: string) => labelRows.find((l) => l.name === name)!;

  // 4. Tasks
  const taskDefs: Array<Omit<NewTask, "number" | "position"> & { labels?: string[]; assignees?: string[] }> = [
    { projectId: orders.id, title: "قراءة وثيقة متطلبات المشروع", description: "الوثيقة في مجلد المشروع المشترك. يرجى تسجيل أي ملاحظات في التعليقات.", status: "todo", priority: "medium", creatorId: sara.id, dueDate: todayISO(3) },
    { projectId: orders.id, title: "الالتزام بمعايير التسمية في الكود", description: "camelCase للمتغيرات، PascalCase للمكونات، kebab-case للملفات.", status: "in_progress", priority: "low", creatorId: sara.id },
    { projectId: orders.id, title: "تصميم شاشة تسجيل الدخول", status: "done", priority: "high", assignees: [noura.id], creatorId: sara.id, dueDate: todayISO(-6), completedAt: new Date(), labels: ["تصميم"] },
    { projectId: orders.id, title: "تصميم لوحة تحكم التاجر", description: "الشاشة الرئيسية، قائمة الطلبات، صفحة الطلب، والتقارير.", status: "in_review", priority: "high", assignees: [noura.id], creatorId: sara.id, dueDate: todayISO(2), labels: ["تصميم"] },
    { projectId: orders.id, title: "بناء واجهة قائمة الطلبات", status: "in_progress", priority: "high", assignees: [mohammed.id], creatorId: sara.id, dueDate: todayISO(5), estimateHours: 16, labels: ["واجهة"] },
    { projectId: orders.id, title: "صفحة تفاصيل الطلب", status: "todo", priority: "medium", assignees: [mohammed.id], creatorId: sara.id, dueDate: todayISO(9), estimateHours: 8, labels: ["واجهة"] },
    { projectId: orders.id, title: "إصلاح خطأ عرض الأسعار بالهللات", status: "todo", priority: "urgent", assignees: [mohammed.id], creatorId: admin.id, dueDate: todayISO(-1), labels: ["واجهة", "خطأ"] },
    { projectId: orders.id, title: "تصميم قاعدة البيانات (الطلبات والمدفوعات)", status: "done", priority: "high", assignees: [fahad.id], creatorId: sara.id, dueDate: todayISO(-10), completedAt: new Date(), labels: ["خلفية"] },
    { projectId: orders.id, title: "API إنشاء الطلب والدفع", status: "in_progress", priority: "urgent", assignees: [fahad.id, mohammed.id], creatorId: sara.id, dueDate: todayISO(1), estimateHours: 24, labels: ["خلفية"] },
    { projectId: orders.id, title: "ربط بوابة الدفع (مدى / Apple Pay)", status: "backlog", priority: "high", assignees: [fahad.id], creatorId: sara.id, dueDate: todayISO(14), labels: ["خلفية"] },
    { projectId: orders.id, title: "تقارير المبيعات اليومية", status: "backlog", priority: "medium", creatorId: sara.id, dueDate: todayISO(21) },
    { projectId: orders.id, title: "اختبار الأداء تحت الضغط", status: "backlog", priority: "low", creatorId: admin.id },
    { projectId: app.id, title: "تحديد نطاق الإصدار الأول", description: "ما الذي يدخل في MVP وما الذي يؤجل.", status: "in_progress", priority: "high", creatorId: admin.id, dueDate: todayISO(4) },
    { projectId: app.id, title: "نماذج أولية للشاشات الرئيسية", status: "todo", priority: "high", assignees: [noura.id], creatorId: admin.id, dueDate: todayISO(12) },
    { projectId: app.id, title: "إعداد مشروع iOS", status: "backlog", priority: "medium", assignees: [sara.id], creatorId: admin.id, labels: ["iOS"] },
    { projectId: app.id, title: "إعداد مشروع Android", status: "backlog", priority: "medium", creatorId: admin.id, labels: ["Android"] },
  ];

  const keys: Record<string, string> = { [orders.id]: orders.key, [app.id]: app.key };
  const counters: Record<string, number> = {};
  const positions: Record<string, number> = {};
  const created: Array<{ task: typeof tasks.$inferSelect; taskKey: string; assignees: string[] }> = [];
  for (const def of taskDefs) {
    const { labels: labelNames, assignees = [], ...values } = def;
    counters[values.projectId] = (counters[values.projectId] ?? 0) + 1;
    const posKey = `${values.projectId}:${values.status}`;
    positions[posKey] = (positions[posKey] ?? 0) + 1;
    const [task] = await db
      .insert(tasks)
      .values({ ...values, number: counters[values.projectId], position: positions[posKey] })
      .returning();
    if (labelNames?.length) await db.insert(taskLabels).values(labelNames.map((n) => ({ taskId: task.id, labelId: label(n).id })));
    if (assignees.length) await db.insert(taskAssignees).values(assignees.map((userId, i) => ({ taskId: task.id, userId, createdAt: new Date(Date.now() + i) })));
    created.push({ task, taskKey: `${keys[values.projectId]}-${task.number}`, assignees });
  }
  for (const [projectId, n] of Object.entries(counters)) await db.update(projects).set({ taskCounter: n }).where(eq(projects.id, projectId));

  const byTitle = (title: string) => created.find((c) => c.task.title === title)!;
  const orderList = byTitle("بناء واجهة قائمة الطلبات");
  await db.insert(checklistItems).values([
    { taskId: orderList.task.id, title: "جدول الطلبات مع الترقيم", done: true, position: 1 },
    { taskId: orderList.task.id, title: "تصفية حسب الحالة والتاريخ", done: true, position: 2 },
    { taskId: orderList.task.id, title: "بحث برقم الطلب", done: false, position: 3 },
    { taskId: orderList.task.id, title: "تصدير CSV", done: false, position: 4 },
  ]);
  const api = byTitle("API إنشاء الطلب والدفع");
  await db.insert(comments).values([
    { taskId: api.task.id, authorId: fahad.id, body: "أنهيت نقطة إنشاء الطلب، متبقي التحقق من المخزون قبل تأكيد الدفع." },
    { taskId: api.task.id, authorId: sara.id, body: "ممتاز. رجاءً وثّق الاستجابات في Postman قبل التسليم للمراجعة." },
    { taskId: orderList.task.id, authorId: mohammed.id, body: "التصفية جاهزة، أحتاج تصميم حالة القائمة الفارغة من نورة." },
  ]);

  // 5. Activity and notifications
  await db.insert(activities).values([
    { projectId: orders.id, actorId: sara.id, type: "project_created", payload: { projectName: orders.name, projectKey: orders.key } },
    { projectId: app.id, actorId: admin.id, type: "project_created", payload: { projectName: app.name, projectKey: app.key } },
    ...created.map((c) => ({
      projectId: c.task.projectId,
      taskId: c.task.id,
      actorId: c.task.creatorId,
      type: "task_created",
      payload: { taskKey: c.taskKey, taskTitle: c.task.title, general: c.assignees.length === 0 },
    })),
    { projectId: orders.id, taskId: api.task.id, actorId: fahad.id, type: "comment_added", payload: { taskKey: api.taskKey, taskTitle: api.task.title } },
  ]);

  const priceBug = byTitle("إصلاح خطأ عرض الأسعار بالهللات");
  const dashboardDesign = byTitle("تصميم لوحة تحكم التاجر");
  await db.insert(notifications).values([
    { userId: mohammed.id, actorId: admin.id, type: "task_assigned", payload: { taskKey: priceBug.taskKey, taskTitle: priceBug.task.title, projectName: orders.name }, href: taskHref(orders.id, priceBug.task.id) },
    { userId: sara.id, actorId: fahad.id, type: "comment_added", payload: { taskKey: api.taskKey, taskTitle: api.task.title, excerpt: "أنهيت نقطة إنشاء الطلب..." }, href: taskHref(orders.id, api.task.id) },
    { userId: sara.id, actorId: noura.id, type: "review_requested", payload: { taskKey: dashboardDesign.taskKey, taskTitle: dashboardDesign.task.title }, href: taskHref(orders.id, dashboardDesign.task.id) },
  ]);

  console.log(`Seeded ${created.length} tasks across 2 projects.`);
}

main()
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
