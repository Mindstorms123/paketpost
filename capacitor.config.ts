import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.paketpost.tracker",
  appName: "Paketpost",
  // Static build (STATIC_BUILD=1) is bundled into the APK: the app works fully offline-first.
  webDir: "web",
  plugins: {
    // Native HTTP lets the app talk directly to carrier APIs without a relay server.
    CapacitorHttp: { enabled: true },
  },
};

export default config;
