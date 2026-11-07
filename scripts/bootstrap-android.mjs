import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const androidRoot = resolve(root, "android");
const packagePath = "com/dayflow/app";
const javaDirectory = resolve(androidRoot, "app", "src", "main", "java", packagePath);
const pluginSource = resolve(root, "native", "android", "DayFlowNativePlugin.java");
const runNpx = (args) => execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", args, {
  cwd: root,
  stdio: "inherit"
});

if (!existsSync(resolve(root, "capacitor.config.ts"))) {
  throw new Error("capacitor.config.ts is required.");
}
if (!existsSync(pluginSource)) {
  throw new Error("The DayFlow Android native plugin source is missing.");
}

if (!existsSync(resolve(androidRoot, "app", "build.gradle"))) {
  runNpx(["cap", "add", "android"]);
}

mkdirSync(javaDirectory, { recursive: true });
copyFileSync(pluginSource, resolve(javaDirectory, "DayFlowNativePlugin.java"));

const mainActivity = resolve(javaDirectory, "MainActivity.java");
const mainActivitySource = [
  "package com.dayflow.app;",
  "",
  "import android.os.Bundle;",
  "import com.getcapacitor.BridgeActivity;",
  "",
  "public class MainActivity extends BridgeActivity {",
  "    @Override",
  "    public void onCreate(Bundle savedInstanceState) {",
  "        registerPlugin(DayFlowNativePlugin.class);",
  "        super.onCreate(savedInstanceState);",
  "    }",
  "}",
  ""
].join("\n");
writeFileSync(mainActivity, mainActivitySource, "utf8");

const manifest = resolve(androidRoot, "app", "src", "main", "AndroidManifest.xml");
if (!existsSync(manifest)) {
  throw new Error("The generated Android manifest was not found.");
}
let xml = readFileSync(manifest, "utf8");
const application = xml.match(/<application\b[^>]*>/);
if (!application) throw new Error("The Android application manifest element was not found.");

function setAttribute(tag, name, value) {
  const escaped = name.replace(/[.*+?^$\x7B\x7D()|\[\]\\]/g, "\\$&");
  const expression = new RegExp("\\s" + escaped + "=\"[^\"]*\"");
  return expression.test(tag)
    ? tag.replace(expression, " " + name + "=\"" + value + "\"")
    : tag.replace("<application", "<application " + name + "=\"" + value + "\"");
}

let applicationTag = application[0];
applicationTag = setAttribute(applicationTag, "android:allowBackup", "false");
applicationTag = setAttribute(applicationTag, "android:usesCleartextTraffic", "false");
xml = xml.replace(application[0], applicationTag);

const internetPermission = '<uses-permission android:name="android.permission.INTERNET" />';
if (!xml.includes(internetPermission)) {
  const manifestTag = xml.match(/<manifest\\b[^>]*>/);
  if (!manifestTag) throw new Error("The Android manifest root element was not found.");
  xml = xml.replace(manifestTag[0], manifestTag[0] + "\\n    " + internetPermission);
}
writeFileSync(manifest, xml, "utf8");

console.log("DayFlow Android shell bootstrapped and native plugin registered.");
console.log("Next: npx cap sync android");
