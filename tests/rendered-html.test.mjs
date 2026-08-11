import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html", host: "localhost" },
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the finished drawing studio shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /OTHER THAN WORKS/);
  assert.match(html, /하루 10분 그림 작업실/);
  assert.match(html, /작업실 문을 여는 중/);
  assert.match(html, /manifest\.webmanifest/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/);
});

test("includes the complete shared MVP and installable web app assets", async () => {
  const [page, layout, styles, manifest, serviceWorker, packageJson, communityClient, worker, hosting, migration, messageMigration] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/community-client.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_shared_studio.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_profile_message.sql", import.meta.url), "utf8"),
  ]);

  assert.match(page, /visibilitychange/);
  assert.match(page, /validateCharacter/);
  assert.match(page, /1024 × 1024px/);
  assert.match(page, /IndexedDB|indexedDB/);
  assert.match(page, /CompletionModal/);
  assert.match(page, /TogetherPanel/);
  assert.match(page, /RecordsPanel/);
  assert.match(page, /GalleryPanel/);
  assert.match(page, /MissionPanel/);
  assert.match(layout, /brand-character\.png/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(serviceWorker, /caches\.open/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(communityClient, /fetchCommunity/);
  assert.match(communityClient, /updatePresence/);
  assert.match(communityClient, /saveCloudSession/);
  assert.match(communityClient, /updateSharedMessage/);
  assert.match(worker, /handleCommunityApi/);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(hosting, /"r2": "UPLOADS"/);
  assert.match(migration, /CREATE TABLE `profiles`/);
  assert.match(migration, /CREATE TABLE `presence`/);
  assert.match(migration, /CREATE TABLE `work_sessions`/);
  assert.match(messageMigration, /ADD `message`/);
  assert.match(page, /예시 캐릭터/);
  assert.match(page, /desk-scene/);
  assert.match(page, /내 캐릭터 위 메시지/);
  assert.doesNotMatch(page, /friendSeed|gallerySeed/);

  await access(new URL("../public/brand-character.png", import.meta.url));
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
  await access(new URL(".openai/hosting.json", root));
});
