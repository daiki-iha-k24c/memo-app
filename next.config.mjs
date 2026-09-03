import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const legacyConfigPath = path.join(rootDir, "supabase-config.js");
const legacyConfig = fs.existsSync(legacyConfigPath) ? fs.readFileSync(legacyConfigPath, "utf8") : "";
const readConfigValue = (name) => legacyConfig.match(new RegExp(`${name}:\\s*[\"']([^\"']+)[\"']`))?.[1] || "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || readConfigValue("url");
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || readConfigValue("publishableKey");
const isGitHubPagesBuild = process.env.GITHUB_ACTIONS === "true";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: isGitHubPagesBuild ? "/memo-app" : "",
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabasePublishableKey
  }
};

export default nextConfig;
