import type { MetadataRoute } from "next";
import { dict } from "@/lib/i18n/dictionary";

/**
 * Makes the system installable: "Add to Home Screen" on iPhone and iPad,
 * "Install app" on Android, Windows and Mac. Browsers fetch this file without
 * the session cookie, so it is public and uses Arabic, the default language.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: dict.app.name.ar,
    short_name: dict.app.name.ar,
    description: dict.app.tagline.ar,
    lang: "ar",
    dir: "rtl",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#8554eb",
    theme_color: "#33177e",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
