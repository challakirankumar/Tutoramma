import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/*
 * `npm run build` runs the OpenNext Cloudflare build, which in turn runs the
 * plain Next.js build through `buildCommand` (avoids a build loop).
 * So the Cloudflare dashboard's default build command just works.
 */
export default {
  ...defineCloudflareConfig({}),
  buildCommand: "npm run build:next",
};
