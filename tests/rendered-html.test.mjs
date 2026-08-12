import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render(authenticated = false) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: {
        accept: "text/html",
        host: "localhost",
        ...(authenticated ? { "oai-authenticated-user-id": "test-user", "oai-authenticated-user-email": "test@example.com" } : {}),
      },
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the stable account sign-in gate", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /OTHER THAN WORKS/);
  assert.match(html, /ChatGPT로 로그인/);
  assert.match(html, /signin-with-chatgpt/);
  assert.match(html, /같은 캐릭터와 그림 기록/);
  assert.match(html, /manifest\.webmanifest/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/);
});

test("server-renders the studio loader for a signed-in account", async () => {
  const response = await render(true);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /작업실 문을 여는 중/);
  assert.doesNotMatch(html, /ChatGPT로 로그인/);
});

test("includes the complete shared MVP, roster, host controls and map assets", async () => {
  const [page, studio, layout, styles, manifest, serviceWorker, packageJson, communityClient, communityApi, requestAuth, worker, hosting, migration, messageMigration, accountMigration, presetMigration] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/community-client.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/server/api/community-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/server/auth/request-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_shared_studio.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_profile_message.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0002_accounts_roster_map.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0003_character_presets.sql", import.meta.url), "utf8"),
  ]);

  assert.match(page, /getChatGPTUser/);
  assert.match(page, /chatGPTSignInPath/);
  assert.match(studio, /visibilitychange/);
  assert.match(studio, /seconds: 300/);
  assert.match(studio, /자유 집중/);
  assert.match(studio, /timerTargets/);
  assert.match(studio, /분 바로 시작/);
  assert.match(studio, /validateCharacter/);
  assert.match(studio, /PresetPicker/);
  assert.match(studio, /canvas\.toDataURL\("image\/png"\)/);
  assert.match(studio, /1024 × 1024px/);
  assert.match(studio, /IndexedDB|indexedDB/);
  assert.match(studio, /CompletionModal/);
  assert.match(studio, /TogetherPanel/);
  assert.match(studio, /RecordsPanel/);
  assert.match(studio, /GalleryPanel/);
  assert.match(studio, /MissionPanel/);
  assert.match(layout, /og\.jpg/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(serviceWorker, /caches\.open/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(communityClient, /fetchCommunity/);
  assert.match(communityClient, /updatePresence/);
  assert.match(communityClient, /saveCloudSession/);
  assert.match(communityClient, /updateSharedMessage/);
  assert.match(communityClient, /setupRoster/);
  assert.match(communityClient, /claimRoster/);
  assert.match(communityClient, /updateTeacherNote/);
  assert.match(communityClient, /addRosterStudents/);
  assert.match(communityClient, /removeRosterStudent/);
  assert.match(communityApi, /admin_user_hash/);
  assert.match(communityApi, /mon\.mut\.friends@gmail\.com/);
  assert.match(communityApi, /action === "add"/);
  assert.match(communityApi, /action === "remove"/);
  assert.match(communityApi, /ensureAdminMember/);
  assert.match(communityApi, /INSERT OR IGNORE INTO students/);
  assert.match(communityApi, /student_already_claimed/);
  assert.match(communityApi, /teacher_note/);
  assert.match(requestAuth, /oai-authenticated-user-id/);
  assert.match(worker, /handleCommunityApi/);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(hosting, /"r2": "UPLOADS"/);
  assert.match(migration, /CREATE TABLE `profiles`/);
  assert.match(migration, /CREATE TABLE `presence`/);
  assert.match(migration, /CREATE TABLE `work_sessions`/);
  assert.match(messageMigration, /ADD `message`/);
  assert.match(accountMigration, /CREATE TABLE `students`/);
  assert.match(accountMigration, /CREATE TABLE `app_settings`/);
  assert.match(presetMigration, /character_preset/);
  assert.match(styles, /preset-grid/);
  assert.match(styles, /studio-room\.jpg/);
  assert.match(styles, /shared-studio\.jpg/);
  assert.match(styles, /timer-presets/);
  assert.match(studio, /예시 캐릭터/);
  assert.match(studio, /명단 저장하고 내 작업실 열기/);
  assert.match(studio, /together-map/);
  assert.match(studio, /floating-name/);
  assert.match(studio, /map-chair/);
  assert.match(studio, /내 캐릭터 위 메시지/);
  assert.match(studio, /한마디 수정/);
  assert.doesNotMatch(studio, /desk-tablet|아이패드 책상/);
  assert.doesNotMatch(studio, /friendSeed|gallerySeed/);

  await access(new URL("../public/brand-character.png", import.meta.url));
  await access(new URL("../public/studio-room.jpg", import.meta.url));
  await access(new URL("../public/shared-studio.jpg", import.meta.url));
  for (const color of ["blue", "green", "orange", "pink", "purple", "yellow"]) {
    await access(new URL(`../public/folder-${color}.png`, import.meta.url));
  }
  await access(new URL("../public/og.jpg", import.meta.url));
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
  await access(new URL(".openai/hosting.json", root));
});
