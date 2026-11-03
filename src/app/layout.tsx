import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { dirOf } from "@/lib/i18n";
import { LanguageProvider } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import { getLang, getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return {
    title: { default: t(dict.app.name), template: `%s | ${t(dict.app.name)}` },
    description: "إنجاز من مجتمع إنجاز: مشاريع الفريق ومهامه في مكان واحد. Injaz by Injaz Community: your team's projects and tasks in one place.",
    applicationName: t(dict.app.name),
    icons: { icon: "/icon.png", apple: "/icons/apple-touch-icon.png" },
    // Opened from the iPhone home screen it runs full screen, like an installed app.
    appleWebApp: { capable: true, title: t(dict.app.name), statusBarStyle: "default" },
  };
}

export const viewport: Viewport = {
  themeColor: "#33177e",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} dir={dirOf(lang)} className={``} suppressHydrationWarning>
      <body className="min-h-screen bg-paper text-ink antialiased" suppressHydrationWarning>
        <LanguageProvider lang={lang}>
          <ToastProvider>{children}</ToastProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
