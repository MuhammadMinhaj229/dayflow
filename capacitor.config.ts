import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.dayflow.app",
  appName: "DayFlow",
  webDir: "dist",
  android: {
    allowMixedContent: false
  },
  server: {
    androidScheme: "https"
  }
};

export default config;
