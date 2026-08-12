"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from "react";
import {
  createRosterClass,
  fetchCommunity,
  fetchRoster,
  getDeviceIdentity,
  joinRosterClass,
  removeGalleryArtwork,
  removeRosterStudent,
  resetRosterStudent,
  saveCloudProfile,
  saveCloudSession,
  sendPresenceStop,
  sendPresenceOffline,
  setupRoster,
  updatePresence,
  updateRosterClassCode,
  updateSharedMessage,
  updateTeacherNote,
} from "./lib/community-client";
import type {
  CategoryKey,
  CharacterPresetKey,
  DeviceIdentity,
  Profile,
  RosterSnapshot,
  SharedArtwork,
  SharedFriend,
  WorkSession,
} from "./lib/community-types";

type PersistedState = {
  profile: Profile | null;
  sessions: WorkSession[];
};

type TabKey = "home" | "focus" | "together" | "records" | "gallery";
type TimerTarget = 0 | 300 | 600 | 1200 | 1800;

const categories: Array<{
  key: CategoryKey;
  title: string;
  icon: string;
}> = [
  { key: "sketch", title: "스케치", icon: "✎" },
  { key: "line", title: "선화", icon: "⌁" },
  { key: "color", title: "채색", icon: "◒" },
  { key: "emoticon", title: "이모티콘", icon: "☺" },
  { key: "free", title: "자유 작업", icon: "✦" },
];

const characterPresets: Array<{ key: CharacterPresetKey; name: string }> = [
  { key: "sky", name: "blue" },
  { key: "moss", name: "green" },
  { key: "apricot", name: "orange" },
  { key: "rose", name: "pink" },
  { key: "violet", name: "purple" },
  { key: "lemon", name: "yellow" },
];

const presetCharacterAssets: Record<CharacterPresetKey, string> = {
  sky: "/folder-blue.png",
  moss: "/folder-green.png",
  apricot: "/folder-orange.png",
  rose: "/folder-pink.png",
  violet: "/folder-purple.png",
  lemon: "/folder-yellow.png",
};

const milestones = [
  { minutes: 0, title: "작은 책상", detail: "나만의 작업실이 생겼어요.", icon: "1" },
  { minutes: 10, title: "파란 스탠드", detail: "첫 10분, 책상에 불이 켜져요.", icon: "2" },
  { minutes: 30, title: "햇살 창문", detail: "누적 30분, 창가가 환해져요.", icon: "3" },
  { minutes: 60, title: "재료 선반", detail: "누적 1시간, 도구 자리가 생겨요.", icon: "4" },
  { minutes: 180, title: "영감의 벽", detail: "누적 3시간, 스케치가 걸려요.", icon: "5" },
  { minutes: 360, title: "밤의 작업실", detail: "누적 6시간, 늦은 밤의 불빛이 열려요.", icon: "6" },
];

const timerTargets: Array<{ seconds: TimerTarget; label: string }> = [
  { seconds: 300, label: "5분" },
  { seconds: 600, label: "10분" },
  { seconds: 1200, label: "20분" },
  { seconds: 1800, label: "30분" },
  { seconds: 0, label: "자유" },
];

const DB_NAME = "other-than-works-mvp";
const STORE_NAME = "app-state";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadPersistedState(): Promise<PersistedState | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get("current");
    request.onsuccess = () => resolve((request.result as PersistedState | undefined) ?? null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

async function savePersistedState(state: PersistedState): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(state, "current");
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

async function validateCharacter(file: File): Promise<string> {
  if (file.type !== "image/png" && !file.name.toLowerCase().endsWith(".png")) {
    throw new Error("캐릭터는 PNG 파일로 올려주세요.");
  }
  const dataUrl = await readFile(file);
  const image = await loadImage(dataUrl);
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = image.naturalWidth;
  sourceCanvas.height = image.naturalHeight;
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) throw new Error("이미지를 확인하지 못했어요.");
  sourceContext.drawImage(image, 0, 0);
  const pixels = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height).data;
  let transparentPixelFound = false;
  let minX = sourceCanvas.width;
  let minY = sourceCanvas.height;
  let maxX = -1;
  let maxY = -1;
  const scanStride = Math.max(1, Math.ceil(Math.max(sourceCanvas.width, sourceCanvas.height) / 2048));
  for (let y = 0; y < sourceCanvas.height; y += scanStride) {
    for (let x = 0; x < sourceCanvas.width; x += scanStride) {
      const alpha = pixels[(y * sourceCanvas.width + x) * 4 + 3];
      if (alpha < 250) transparentPixelFound = true;
      if (alpha > 24) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (!transparentPixelFound) {
    throw new Error("배경이 투명한 PNG로 저장해 주세요.");
  }
  if (maxX < minX || maxY < minY) {
    throw new Error("캐릭터가 보이는 PNG로 올려주세요.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("이미지를 확인하지 못했어요.");
  const sourceX = Math.max(0, minX - scanStride);
  const sourceY = Math.max(0, minY - scanStride);
  const sourceWidth = Math.min(sourceCanvas.width - sourceX, maxX - minX + scanStride * 2);
  const sourceHeight = Math.min(sourceCanvas.height - sourceY, maxY - minY + scanStride * 2);
  const scale = Math.min(760 / sourceWidth, 800 / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const feetLine = 914;
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, (1024 - width) / 2, feetLine - height, width, height);
  return canvas.toDataURL("image/png");
}

async function prepareArtwork(file: File): Promise<string> {
  const source = await readFile(file);
  const image = await loadImage(source);
  const maxSize = 1600;
  const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return source;
  context.fillStyle = "#f7f2e8";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.84);
}

function downloadCharacterTemplate() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, 1024, 1024);
  context.strokeStyle = "rgba(67, 99, 86, .65)";
  context.lineWidth = 5;
  context.setLineDash([18, 16]);
  context.strokeRect(112, 112, 800, 800);
  context.setLineDash([]);
  context.strokeStyle = "rgba(209, 135, 79, .85)";
  context.beginPath();
  context.moveTo(112, 832);
  context.lineTo(912, 832);
  context.stroke();
  context.fillStyle = "rgba(67, 99, 86, .75)";
  context.font = "700 30px sans-serif";
  context.textAlign = "center";
  context.fillText("SAFE AREA", 512, 164);
  context.fillStyle = "rgba(166, 94, 45, .9)";
  context.font = "600 24px sans-serif";
  context.fillText("FEET LINE", 512, 880);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = "OTW-character-template-1024.png";
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }, "image/png");
}

function categoryTitle(key: CategoryKey) {
  return categories.find((category) => category.key === key)?.title ?? "자유 작업";
}

function minutesFor(seconds: number) {
  return Math.max(1, Math.floor(seconds / 60));
}

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function timerDisplay(elapsed: number, target: TimerTarget) {
  if (target === 0) return formatTimer(elapsed);
  if (elapsed <= target) return formatTimer(target - elapsed);
  return `+${formatTimer(elapsed - target)}`;
}

function isSameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function isThisWeek(date: Date) {
  const now = new Date();
  const start = new Date(now);
  const day = (now.getDay() + 6) % 7;
  start.setHours(0, 0, 0, 0);
  start.setDate(now.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return date >= start && date < end;
}

function DefaultCharacter({ compact = false, preset = "sky" }: { compact?: boolean; preset?: CharacterPresetKey }) {
  return (
    <img
      className={`character-image official preset-${preset}${compact ? " compact" : ""}`}
      src={presetCharacterAssets[preset]}
      alt={`${characterPresets.find((item) => item.key === preset)?.name ?? "blue"} 폴더 캐릭터`}
    />
  );
}

function Character({ profile, compact = false }: { profile: Profile; compact?: boolean }) {
  if (profile.characterDataUrl) {
    return <img className={`character-image custom${compact ? " compact" : ""}`} src={profile.characterDataUrl} alt={`${profile.name} 캐릭터`} />;
  }
  return <DefaultCharacter compact={compact} preset={profile.characterPreset ?? "sky"} />;
}

function FocusCharacter({ profile }: { profile: Profile }) {
  if (profile.characterDataUrl) return <Character profile={profile} />;
  return <img className={`character-image official focus-preset preset-${profile.characterPreset ?? "sky"}`} src="/folder-focus-blue.png" alt={`${profile.name}가 펜을 들고 집중하는 모습`} />;
}

function PresetPicker({ selected, custom, onSelect }: { selected: CharacterPresetKey; custom: boolean; onSelect: (preset: CharacterPresetKey) => void }) {
  return (
    <div className="preset-section">
      <div className="preset-heading"><b>폴더 친구 고르기</b><span>{custom ? "내 PNG 사용 중" : "언제든 바꿀 수 있어요"}</span></div>
      <div className="preset-grid">
        {characterPresets.map((preset) => (
          <button className={!custom && selected === preset.key ? "selected" : ""} type="button" key={preset.key} onClick={() => onSelect(preset.key)}>
            <DefaultCharacter compact preset={preset.key} />
            <span>{preset.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Enrollment({ snapshot, onComplete }: { snapshot: RosterSnapshot; onComplete: () => void }) {
  const [names, setNames] = useState("");
  const [className, setClassName] = useState("");
  const [classCode, setClassCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [selectedClassId, setSelectedClassId] = useState(snapshot.classes[0]?.id ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const setupNames = names.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);

  if (snapshot.needsSetup) {
    return (
      <main className="enrollment-shell">
        <section className="enrollment-card host-setup">
          <p className="eyebrow">HOST SETUP</p>
          <DefaultCharacter />
          <h1>수강생 작업실을<br />처음 열어주세요</h1>
          <p>첫 반만 만들어두면 수강생은 Google 계정으로 로그인해 스스로 닉네임을 정하고 반을 선택할 수 있어요.</p>
          <label className="field-label" htmlFor="setup-class-name">첫 반 이름</label>
          <input id="setup-class-name" className="text-input" value={className} maxLength={20} onChange={(event) => setClassName(event.target.value)} placeholder="예: 이모티콘 8월반" />
          <label className="field-label" htmlFor="class-code">수강생에게 알려줄 반 코드</label>
          <input id="class-code" className="text-input" value={classCode} maxLength={20} onChange={(event) => setClassCode(event.target.value)} placeholder="4자 이상" />
          <details className="legacy-roster-setup"><summary>기존 명단이 있다면 함께 넣기 (선택)</summary><textarea id="student-list" value={names} onChange={(event) => setNames(event.target.value)} placeholder={"한 줄에 한 명씩"} /></details>
          <p className="setup-requirements">반 이름 · 반 코드 4자 이상</p>
          {error && <p className="error-message" role="alert">{error}</p>}
          <button className="primary-button wide" type="button" disabled={saving} onClick={async () => {
            try {
              setSaving(true);
              setError("");
              if (!className.trim()) throw new Error("반 이름을 적어주세요.");
              if (classCode.trim().length < 4) throw new Error("반 코드는 네 글자 이상 적어주세요.");
              await setupRoster(setupNames, classCode.trim(), className.trim());
              onComplete();
            } catch (setupError) {
              setError(setupError instanceof Error ? setupError.message : "명단을 저장하지 못했어요.");
            } finally {
              setSaving(false);
            }
          }}>{saving ? "작업실을 준비하는 중…" : "첫 반 만들고 내 작업실 열기"}</button>
          <a className="signout-link" href="/auth/logout">다른 계정으로 로그인</a>
        </section>
      </main>
    );
  }

  return (
    <main className="enrollment-shell">
      <section className="enrollment-card">
        <p className="eyebrow">JOIN MY CLASS</p>
        <h1>반과 닉네임만<br />정하면 준비 끝!</h1>
        <p>실명 명단을 찾지 않아도 돼요. 수업 반을 고르고 선생님이 알려준 코드를 적어주세요.</p>
        <div className="enrollment-step"><b>1</b><span>수업 반 선택</span><small>이름 위에 작게 표시돼요.</small></div>
        <div className="class-choice-grid">
          {snapshot.classes.map((item) => <button type="button" key={item.id} className={selectedClassId === item.id ? "selected" : ""} onClick={() => { setSelectedClassId(item.id); setError(""); }}><span>{item.name}</span><i>{selectedClassId === item.id ? "✓" : "선택"}</i></button>)}
          {!snapshot.classes.length && <p>아직 들어갈 수 있는 반이 없어요. 선생님에게 반 생성을 요청해주세요.</p>}
        </div>
        <div className="enrollment-step"><b>2</b><span>반 코드</span><small>선생님이 반별로 알려준 코드예요.</small></div>
        <input id="join-code" className="text-input" value={classCode} maxLength={20} onChange={(event) => setClassCode(event.target.value)} placeholder="반 코드 4자 이상" autoCapitalize="characters" />
        <div className="enrollment-step"><b>3</b><span>앱에서 보일 닉네임</span><small>나중에 캐릭터 설정에서 바꿀 수 있어요.</small></div>
        <input id="student-nickname" className="text-input" value={nickname} maxLength={12} onChange={(event) => setNickname(event.target.value)} placeholder="예: 소랭" />
        {error && <p className="error-message" role="alert">{error}</p>}
        <button className="primary-button wide" type="button" disabled={saving} onClick={async () => {
          try {
            setSaving(true);
            setError("");
            if (!selectedClassId) throw new Error("들어갈 반을 먼저 선택해주세요.");
            if (classCode.trim().length < 4) throw new Error("반 코드를 네 글자 이상 적어주세요.");
            if (!nickname.trim()) throw new Error("앱에서 사용할 닉네임을 적어주세요.");
            await joinRosterClass(selectedClassId, nickname.trim(), classCode.trim());
            onComplete();
          } catch (claimError) {
            setError(claimError instanceof Error ? claimError.message : "반에 들어가지 못했어요.");
          } finally {
            setSaving(false);
          }
        }}>{saving ? "내 작업실과 연결하는 중…" : "다음 · 내 작업실 열기"}</button>
        <a className="signout-link" href="/auth/logout">다른 Google 계정으로 로그인</a>
      </section>
    </main>
  );
}

function Onboarding({ onComplete }: { onComplete: (profile: Profile) => Promise<void> }) {
  const [name, setName] = useState("");
  const [preset, setPreset] = useState<CharacterPresetKey>("sky");
  const [character, setCharacter] = useState<string>();
  const [error, setError] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleCharacter(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setError("");
      setCharacter(await validateCharacter(file));
    } catch (uploadError) {
      setCharacter(undefined);
      setError(uploadError instanceof Error ? uploadError.message : "이미지를 확인하지 못했어요.");
    }
  }

  return (
    <main className="onboarding-shell">
      <section className="onboarding-copy">
        <p className="eyebrow">OTHER THAN WORKS</p>
        <h1>매일 10분,<br />같이 작업할 친구</h1>
        <p>잘 그리는 날보다 시작하는 날을 늘려봐요.<br />친구 이름을 짓고 작업실 문을 열어주세요.</p>
        <div className="onboarding-promise">
          <span>10</span>
          <p><b>10분이면 오늘도 성공</b><br />순위도, 재화도, 밀린 숙제도 없어요.</p>
        </div>
      </section>

      <section className="onboarding-card" aria-label="작업친구 만들기">
        <div className="onboarding-character-stage">
          {character ? <img src={character} className="character-image onboarding" alt="업로드한 작업친구" /> : <DefaultCharacter preset={preset} />}
          <span className="character-nameplate">{name.trim() || "예시 캐릭터"}</span>
        </div>
        <h2>내 작업친구를 소개해요</h2>
        <p className="subtle">폴더 친구를 고르거나, 직접 그린 투명 PNG를 불러올 수 있어요.</p>

        <PresetPicker selected={preset} custom={Boolean(character)} onSelect={(nextPreset) => { setPreset(nextPreset); setCharacter(undefined); setError(""); }} />

        <label className="field-label" htmlFor="friend-name">작업친구 이름</label>
        <input
          id="friend-name"
          className="text-input"
          value={name}
          maxLength={12}
          onChange={(event) => setName(event.target.value)}
          placeholder="예: 모루"
          autoComplete="off"
        />

        <div className="onboarding-actions">
          <label className="secondary-button file-button">
            <span>{character ? "내 PNG 바꾸기" : "내 PNG 불러오기"}</span>
            <input type="file" accept="image/png" onChange={handleCharacter} />
          </label>
          <button className="secondary-button" type="button" onClick={() => setGuideOpen(true)}>그리기 가이드</button>
        </div>
        {error && <p className="error-message" role="alert">{error}</p>}
        <button
          className="primary-button wide"
          type="button"
          disabled={!name.trim() || saving}
          onClick={async () => {
            try {
              setSaving(true);
              setError("");
              await onComplete({ name: name.trim(), characterPreset: preset, characterDataUrl: character });
            } catch (saveError) {
              setError(saveError instanceof Error ? saveError.message : "공동 작업실에 연결하지 못했어요.");
            } finally {
              setSaving(false);
            }
          }}
        >{saving ? "공동 작업실에 입주하는 중…" : "내 작업실 시작하기"}</button>
        <p className="device-note">이름·캐릭터·완료 그림은 이 링크를 함께 쓰는 수강생에게 보여요.</p>
      </section>

      {guideOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal guide-modal" role="dialog" aria-modal="true" aria-labelledby="guide-title">
            <button className="close-button" type="button" onClick={() => setGuideOpen(false)} aria-label="닫기">×</button>
            <p className="eyebrow">MY CHARACTER TEMPLATE</p>
            <h2 id="guide-title">내 작업친구를<br />직접 그려주세요</h2>
            <div className="template-preview">
              <span>SAFE AREA</span>
              <DefaultCharacter compact />
              <div className="feet-line"><i /><b>발 위치</b><i /></div>
            </div>
            <dl className="guide-list">
              <div><dt>캔버스</dt><dd>1024 × 1024px</dd></div>
              <div><dt>파일</dt><dd>투명 배경 PNG</dd></div>
              <div><dt>구도</dt><dd>정면 또는 3/4 전신</dd></div>
              <div><dt>정렬</dt><dd>발을 기준선에 맞추기</dd></div>
            </dl>
            <p className="subtle guide-copy">Procreate에서 템플릿을 불러온 뒤 새 레이어에 그리세요. 저장할 때 가이드 레이어를 끄고 투명 PNG로 내보내면 됩니다.</p>
            <button className="primary-button wide" type="button" onClick={downloadCharacterTemplate}>1024px PNG 템플릿 저장</button>
          </section>
        </div>
      )}
    </main>
  );
}

function ProfileEditor({ profile, onClose, onSave }: { profile: Profile; onClose: () => void; onSave: (profile: Profile) => Promise<void> }) {
  const [name, setName] = useState(profile.name);
  const [preset, setPreset] = useState<CharacterPresetKey>(profile.characterPreset ?? "sky");
  const [character, setCharacter] = useState(profile.characterDataUrl);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCharacter(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setError("");
      setCharacter(await validateCharacter(file));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "이미지를 확인하지 못했어요.");
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="modal profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <button className="close-button" type="button" onClick={onClose} aria-label="닫기">×</button>
        <p className="eyebrow">MY WORK FRIEND</p>
        <h2 id="profile-title">내 캐릭터 바꾸기</h2>
        <div className="profile-character-stage">
          {character ? <img src={character} className="character-image onboarding" alt="내 작업친구" /> : <DefaultCharacter preset={preset} />}
          <span className="character-nameplate">{name.trim() || "예시 캐릭터"}</span>
        </div>
        <label className="field-label" htmlFor="profile-name">작업친구 이름</label>
        <input id="profile-name" className="text-input" value={name} maxLength={12} onChange={(event) => setName(event.target.value)} />
        <PresetPicker selected={preset} custom={Boolean(character)} onSelect={(nextPreset) => { setPreset(nextPreset); setCharacter(undefined); setError(""); }} />
        <label className="secondary-button file-button profile-file-button">
          <span>{character ? "내 투명 PNG 바꾸기" : "내 투명 PNG 불러오기"}</span>
          <input type="file" accept="image/png" onChange={handleCharacter} />
        </label>
        {error && <p className="error-message" role="alert">{error}</p>}
        <button
          className="primary-button wide"
          type="button"
          disabled={!name.trim() || saving}
          onClick={async () => {
            try {
              setSaving(true);
              setError("");
              await onSave({ ...profile, name: name.trim(), characterPreset: preset, characterDataUrl: character });
              onClose();
            } catch (saveError) {
              setError(saveError instanceof Error ? saveError.message : "프로필을 저장하지 못했어요.");
            } finally {
              setSaving(false);
            }
          }}
        >{saving ? "친구들에게 알리는 중…" : "공동 작업실에 저장"}</button>
        <p className="device-note">Google 계정에 연결되어 다른 기기에서도 같은 작업실이 열려요.</p>
        <a className="signout-link" href="/auth/logout">로그아웃</a>
      </section>
    </div>
  );
}

function HomePanel({
  profile,
  sessions,
  teacherNote,
  onNavigate,
}: {
  profile: Profile;
  sessions: WorkSession[];
  teacherNote: string;
  onNavigate: (tab: TabKey) => void;
}) {
  const totalMinutes = sessions.reduce((sum, session) => sum + minutesFor(session.seconds), 0);
  const todayMinutes = sessions.filter((session) => isSameDay(new Date(session.completedAt), new Date())).reduce((sum, session) => sum + minutesFor(session.seconds), 0);
  const missionProgress = sessions.filter((session) => session.category === "sketch" && isThisWeek(new Date(session.completedAt))).length;
  const villageFriends = [
    { id: "village-green", profile: { name: "green", characterPreset: "moss" as CharacterPresetKey }, x: 23, y: 76, delay: "-3.8s" },
    { id: "village-orange", profile: { name: "orange", characterPreset: "apricot" as CharacterPresetKey }, x: 76, y: 75, delay: "-5.4s" },
  ];

  return (
    <div className="village-home">
      <header className="village-heading">
        <div><p>{new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "long" }).format(new Date())}</p><h2>오늘은 어디서 시작할까요?</h2></div>
        <div><span>오늘 {todayMinutes}분</span><b>누적 {totalMinutes}분</b></div>
      </header>

      <section className="village-map" aria-label="아더댄웍스 창작 마을">
        <img src="/otw-village.png" alt="시계 광장, 작업실과 전시장이 있는 아더댄웍스 창작 마을" />
        <button className="village-hotspot village-studio" type="button" onClick={() => onNavigate("together")}><span>아더댄웍스</span><small>친구들과 작업하기</small></button>
        <button className="village-hotspot village-gallery" type="button" onClick={() => onNavigate("gallery")}><span>전시장</span><small>그림 보러 가기</small></button>
        <button className="village-hotspot village-clock" type="button" onClick={() => onNavigate("focus")}><span>집중 시계</span><small>지금부터 집중 시작!</small></button>
        <button className="village-mission-board" type="button" onClick={() => onNavigate("records")}><small>이번 주 미션</small><b>못생긴 첫 스케치 3번</b><span>{Math.min(missionProgress, 3)} / 3 · 눌러서 확인</span></button>
        <span className="village-me"><span className="village-teacher-speech">{teacherNote}</span><Character profile={profile} /></span>
        {villageFriends.map((friend) => <span className="village-walker" style={{ "--walker-x": `${friend.x}%`, "--walker-y": `${friend.y}%`, "--walker-delay": friend.delay } as CSSProperties} key={friend.id}><Character profile={friend.profile} /></span>)}
      </section>

      <p className="village-guide">건물을 누르면 공간으로 들어가요. 가운데 시계를 누르면 집중 페이지가 열려요.</p>
    </div>
  );
}

function FocusPanel({
  profile,
  elapsed,
  timerTarget,
  running,
  category,
  focusNote,
  pauseNotice,
  onCategory,
  onFocusNote,
  onTimerTarget,
  onToggle,
  onFinish,
  onReset,
}: {
  profile: Profile;
  elapsed: number;
  timerTarget: TimerTarget;
  running: boolean;
  category: CategoryKey;
  focusNote: string;
  pauseNotice: string;
  onCategory: (key: CategoryKey) => void;
  onFocusNote: (note: string) => void;
  onTimerTarget: (target: TimerTarget) => void;
  onToggle: () => void;
  onFinish: () => void;
  onReset: () => void;
}) {
  const timerProgress = timerTarget === 0 ? Math.min(1, elapsed / 600) : Math.min(1, elapsed / timerTarget);
  const timerStyle = { "--timer-progress": `${timerProgress * 360}deg` } as CSSProperties;
  const targetReached = timerTarget > 0 && elapsed >= timerTarget;
  return (
    <div className="focus-page">
      <header className="focus-page-heading"><p className="eyebrow">MY FOCUS ROOM</p><h2>그림에만 머무는 시간</h2><span>앱을 벗어나면 타이머가 잠시 멈춰요.</span></header>

      <section className={`private-focus${running ? " is-running" : ""}`} id="focus-room">
        <div className="focus-ribbon"><img src="/focus-ribbon.png" alt="" /><span>지금부터 집중 시작!</span></div>
        <div className="focus-desk-scene">
          <img className="focus-room-back" src="/focus-room-backdrop.png" alt="" aria-hidden="true" />
          <img className="focus-chair" src="/focus-chair.png" alt="" aria-hidden="true" />
          <div className="focus-character"><FocusCharacter profile={profile} /></div>
          <img className="focus-desk-front" src="/focus-desk-front.png" alt="" aria-hidden="true" />
          <span className="focus-blink" aria-hidden="true" />
        </div>

        <div className="focus-controls">
          <div className="focus-title"><div><p className="eyebrow">내 공간 · POMODORO</p><h3>{running ? "조용히 그리는 중" : "오늘 그릴 것을 정해볼까요?"}</h3></div><i>{targetReached ? "목표 완료" : timerTarget === 0 ? "자유 집중" : `${timerTarget / 60}분`}</i></div>
          <label className="focus-note"><span>이번 집중에 할 일</span><input value={focusNote} onChange={(event) => onFocusNote(event.target.value.slice(0, 40))} disabled={running} placeholder="예: 캐릭터 표정 3개 스케치" maxLength={40} /></label>

          <div className="work-choice compact-work-choice">
            <div className="pill-scroll">{categories.map((item) => <button type="button" key={item.key} disabled={running} onClick={() => onCategory(item.key)} className={`category-pill${category === item.key ? " active" : ""}`}>{item.title}</button>)}</div>
          </div>

          <div className="timer-presets" aria-label="집중 시간 선택">{timerTargets.map((target) => <button type="button" key={target.seconds} disabled={running || elapsed > 0} className={timerTarget === target.seconds ? "active" : ""} onClick={() => onTimerTarget(target.seconds)}>{target.label}</button>)}</div>
          <button className="focus-clock" style={timerStyle} type="button" onClick={onToggle} aria-label={running ? "집중 잠시 멈추기" : "집중 시작하기"}><span><strong>{timerDisplay(elapsed, timerTarget)}</strong><small>{running ? "집중하는 중" : elapsed > 0 ? "눌러서 이어하기" : "시계를 눌러 시작"}</small></span></button>
          {pauseNotice && <p className="pause-notice">Ⅱ {pauseNotice}</p>}
          <div className="timer-actions"><button className="primary-button" type="button" onClick={onToggle}>{running ? "잠시 멈추기" : elapsed === 0 ? "집중 시작하기" : "이어서 하기"}</button>{elapsed > 0 && <button className="finish-button" type="button" onClick={onFinish}>기록</button>}</div>
          {!running && elapsed > 0 && <button className="timer-reset" type="button" onClick={onReset}>이번 타이머 지우기</button>}
        </div>
      </section>
    </div>
  );
}

const idleLines = [
  "레이어 이름을 정리하는 중", "두 손가락 탭은 실행 취소!", "친구들의 전시를 구경 중", "브러시를 고르는 중", "잠깐 눈을 쉬게 하는 중", "다음 그림을 상상하는 중",
];
const idlePlaces = ["gallery", "tips", "lounge"] as const;
type MapPlace = "working" | (typeof idlePlaces)[number];
type MapMember = SharedFriend & { mine?: boolean };
type MapSpot = { x: number; y: number };

const mapSpots: Record<MapPlace, MapSpot[]> = {
  working: [{ x: 40, y: 62 }, { x: 57, y: 65 }, { x: 68, y: 57 }],
  gallery: [{ x: 67, y: 43 }, { x: 78, y: 46 }, { x: 60, y: 48 }],
  tips: [{ x: 18, y: 73 }, { x: 29, y: 78 }, { x: 35, y: 68 }],
  lounge: [{ x: 14, y: 49 }, { x: 84, y: 73 }, { x: 76, y: 82 }],
};

function stringSeed(value: string) {
  return [...value].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) >>> 0, 17);
}

function placeFor(friend: MapMember, clock: number): MapPlace {
  if (friend.mode === "working") return "working";
  return idlePlaces[(stringSeed(friend.id) + Math.floor(clock / 180_000)) % idlePlaces.length];
}

function MapFriend({ friend, clock, spot, order }: { friend: MapMember; clock: number; spot: MapSpot; order: number }) {
  const working = friend.mode === "working";
  const seed = stringSeed(friend.id);
  const fallback = working
    ? `${categoryTitle(friend.category)} · ${Math.max(0, Math.floor((clock - friend.startedAt) / 60_000))}분째`
    : idleLines[(seed + Math.floor(clock / 120_000)) % idleLines.length];
  const direction = seed % 2 === 0 ? 1 : -1;
  const displayName = `${friend.nickname || friend.name}${friend.mine ? " · 나" : ""}`;
  const mapStyle = {
    "--map-x": `${spot.x}%`,
    "--map-y": `${spot.y}%`,
    "--wander-x-a": `${direction * (10 + seed % 8)}px`,
    "--wander-y-a": `${-5 - seed % 6}px`,
    "--wander-x-b": `${direction * (-7 - seed % 7)}px`,
    "--wander-y-b": `${4 + seed % 5}px`,
    "--wander-delay": `${-(seed % 8_000)}ms`,
    zIndex: 10 + order,
  } as CSSProperties;
  return (
    <article style={mapStyle} className={`map-friend${working ? " working" : " idle"}${friend.mine ? " mine" : ""}`}>
      <span className="floating-name" title={`${friend.className ? `${friend.className} · ` : ""}${displayName}`}>{friend.className && <small>{friend.className}</small>}<b>{displayName}</b></span>
      <span className={`map-speech${friend.message ? " personal" : ""}`}>{friend.message || fallback}</span>
      <div className="map-avatar"><Character profile={{ name: friend.name, nickname: friend.nickname, characterPreset: friend.characterPreset, characterDataUrl: friend.characterDataUrl }} /></div>
      {working && <div className="map-chair"><span /><i /></div>}
      {working && <div className="map-desk"><span /><i /><i /></div>}
    </article>
  );
}

function SharedMap({ members, clock }: { members: MapMember[]; clock: number }) {
  const placeCounts: Record<MapPlace, number> = { working: 0, gallery: 0, tips: 0, lounge: 0 };
  const arranged = members.map((member) => {
    const preferredPlace = placeFor(member, clock);
    const place = preferredPlace === "working"
      ? preferredPlace
      : [...idlePlaces].sort((left, right) => {
          const countDifference = placeCounts[left] - placeCounts[right];
          if (countDifference !== 0) return countDifference;
          const preferredIndex = idlePlaces.indexOf(preferredPlace);
          const leftDistance = (idlePlaces.indexOf(left) - preferredIndex + idlePlaces.length) % idlePlaces.length;
          const rightDistance = (idlePlaces.indexOf(right) - preferredIndex + idlePlaces.length) % idlePlaces.length;
          return leftDistance - rightDistance;
        })[0];
    const placeOrder = placeCounts[place];
    placeCounts[place] += 1;
    const spots = mapSpots[place];
    const base = spots[placeOrder % spots.length];
    const overflowRow = Math.floor(placeOrder / spots.length);
    return {
      member,
      place,
      spot: {
        x: Math.max(7, Math.min(93, base.x + (overflowRow % 2 === 0 ? overflowRow * 2 : -overflowRow * 2))),
        y: Math.max(12, Math.min(88, base.y + Math.floor(overflowRow / 2) * 7)),
      },
    };
  });
  return (
    <div className={`together-map${members.length > 8 ? " dense" : ""}`} aria-label="수강생들이 머무는 한 화면 공동 작업실 지도">
      <div className="map-people">
        {arranged.map(({ member, spot }, order) => <MapFriend key={member.id} friend={member} clock={clock} spot={spot} order={order} />)}
      </div>
    </div>
  );
}

function TogetherPanel({ profile, activeFriends, running, elapsed, category, clock, onMessage }: { profile: Profile; activeFriends: SharedFriend[]; running: boolean; elapsed: number; category: CategoryKey; clock: number; onMessage: (message: string) => Promise<void> }) {
  const own: MapMember = {
    id: profile.id ?? "mine",
    name: profile.name,
    nickname: profile.nickname,
    characterPreset: profile.characterPreset,
    characterDataUrl: profile.characterDataUrl,
    mode: running ? "working" : "idle",
    category,
    startedAt: running ? clock - elapsed * 1000 : clock,
    message: profile.message ?? "",
    className: profile.className,
    mine: true,
  };
  const members: MapMember[] = [own, ...activeFriends.filter((friend) => friend.id !== profile.id)];
  const workingCount = members.filter((member) => member.mode === "working").length;
  const [message, setMessage] = useState(profile.message ?? "");
  const [messageSaving, setMessageSaving] = useState(false);
  const [messageError, setMessageError] = useState("");
  return (
    <div className="panel-stack section-panel">
      <header className="section-header">
        <div><p className="eyebrow">함께 있는 작업실</p><h2>지금 {members.length}명이 함께 있어요</h2></div>
        <span className="live-orbit"><i /></span>
      </header>
      <p className="section-description">{workingCount}명은 작업 중이에요. 쉬는 친구들은 전시와 작업실 곳곳에서 조용히 시간을 보내요.</p>
      <form className="paper-card message-composer" onSubmit={async (event) => {
        event.preventDefault();
        try {
          setMessageSaving(true);
          setMessageError("");
          await onMessage(message.trim());
        } catch (saveError) {
          setMessageError(saveError instanceof Error ? saveError.message : "메시지를 저장하지 못했어요.");
        } finally {
          setMessageSaving(false);
        }
      }}>
        <label htmlFor="work-message"><b>내 캐릭터 위 메시지</b><span>{message.length} / 60</span></label>
        <div><input id="work-message" className="text-input" value={message} maxLength={60} onChange={(event) => setMessage(event.target.value)} placeholder="예: 오늘은 채색하는 날!" /><button className="primary-button" type="submit" disabled={messageSaving}>{messageSaving ? "저장 중" : "등록"}</button></div>
        {messageError && <p className="error-message" role="alert">{messageError}</p>}
        <small>등록한 메시지는 함께 작업 중인 수강생에게 보여요.</small>
      </form>
      <SharedMap members={members.map((member) => member.mine ? { ...member, message } : member)} clock={clock} />
      <p className="map-strip-hint">집중 중인 친구는 책상에, 쉬는 친구는 전시와 소파 주변에 머물러요.</p>
      <section className="paper-card quiet-rule"><b>♥ 이 공간에는 순위가 없어요</b><p>오래 한 사람보다 오늘 시작한 사람을 반겨요. 집중을 끝내면 캐릭터도 조용히 자기 작업실로 돌아갑니다.</p></section>
    </div>
  );
}

function monthCells(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const count = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = Array(firstDay).fill(null);
  for (let day = 1; day <= count; day += 1) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function RecordsPanel({ sessions, teacherNote, isHost, students, classes, onTeacherNote, onClassCode, onAddClass, onResetStudent, onRemoveStudent }: {
  sessions: WorkSession[];
  teacherNote: string;
  isHost: boolean;
  students: RosterSnapshot["students"];
  classes: RosterSnapshot["classes"];
  onTeacherNote: (note: string) => Promise<void>;
  onClassCode: (classId: string, classCode: string) => Promise<void>;
  onAddClass: (name: string, classCode: string) => Promise<void>;
  onResetStudent: (studentId: string) => Promise<void>;
  onRemoveStudent: (studentId: string) => Promise<void>;
}) {
  const now = new Date();
  const cells = monthCells(now);
  const thisWeekMinutes = sessions.filter((session) => isThisWeek(new Date(session.completedAt))).reduce((sum, session) => sum + minutesFor(session.seconds), 0);
  const thisWeekCount = sessions.filter((session) => isThisWeek(new Date(session.completedAt))).length;
  const dayCount = new Set(sessions.filter((session) => {
    const date = new Date(session.completedAt);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }).map((session) => new Date(session.completedAt).toDateString())).size;
  return (
    <div className="panel-stack section-panel">
      <MissionPanel sessions={sessions} teacherNote={teacherNote} isHost={isHost} onTeacherNote={onTeacherNote} />
      <section className="paper-card news-card">
        <p className="eyebrow">이번 주 기록</p><h2>작업실 소식</h2>
        <div className="award-row"><span>{thisWeekMinutes ? "◆" : "○"}</span><div><b>{thisWeekMinutes ? `${thisWeekCount}번의 시작을 모았어요` : "언제든 다시 시작할 수 있어요"}</b><p>{thisWeekMinutes ? `이번 주 ${thisWeekMinutes}분 동안 작업실 불을 켰어요.` : "쉬었던 날의 기록도 그대로예요. 오늘 5분부터 시작해봐요."}</p></div></div>
      </section>
      <section className="paper-card calendar-card">
        <div className="card-title-row"><b>{now.getFullYear()}년 {now.getMonth() + 1}월</b><span>작업한 날 {dayCount}일</span></div>
        <div className="calendar-grid weekdays">{["일", "월", "화", "수", "목", "금", "토"].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="calendar-grid days">
          {cells.map((date, index) => {
            const worked = date ? sessions.some((session) => isSameDay(new Date(session.completedAt), date)) : false;
            return date ? <span className={`${worked ? "worked " : ""}${isSameDay(date, now) ? "today" : ""}`} key={date.toISOString()}>{date.getDate()}</span> : <span key={`empty-${index}`} />;
          })}
        </div>
      </section>
      <section className="record-section">
        <p className="eyebrow">그림 기록</p><h2>최근 작업</h2>
        {sessions.length === 0 ? (
          <div className="empty-state"><span>▧</span><b>아직 남긴 그림이 없어요</b><p>작업실에서 타이머를 시작하고 오늘의 그림 한 장을 남겨보세요.</p></div>
        ) : sessions.map((session) => (
          <article className="session-row" key={session.id}>
            <img src={session.artworkDataUrl} alt={session.note || `${categoryTitle(session.category)} 작업`} />
            <div><b>{categoryTitle(session.category)}</b><span>{minutesFor(session.seconds)}분 · {new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", hour: "numeric", minute: "numeric" }).format(new Date(session.completedAt))}</span>{session.note && <p>{session.note}</p>}</div>
            {session.seconds >= 300 && <i>✓</i>}
          </article>
        ))}
      </section>
      {isHost && <section className="records-management"><div className="records-management-heading"><p className="eyebrow">선생님 계정 전용</p><h2>반과 수강생 관리</h2><span>기록과 관리가 한곳에 있어요.</span></div><RosterManager students={students} classes={classes} onClassCode={onClassCode} onAddClass={onAddClass} onReset={onResetStudent} onRemove={onRemoveStudent} /></section>}
    </div>
  );
}

const galleryFrameSpots = [
  { x: 8, y: 13, width: 17, height: 21, surface: "wall" },
  { x: 31, y: 12, width: 17, height: 22, surface: "wall" },
  { x: 54, y: 13, width: 17, height: 21, surface: "wall" },
  { x: 77, y: 12, width: 17, height: 22, surface: "wall" },
  { x: 4, y: 63, width: 13, height: 18, surface: "partition" },
  { x: 25, y: 61, width: 15, height: 19, surface: "wall" },
  { x: 61, y: 61, width: 15, height: 19, surface: "wall" },
  { x: 83, y: 63, width: 13, height: 18, surface: "partition" },
] as const;

const galleryVisitorSpots = [
  { x: 22, y: 84, move: 18 }, { x: 43, y: 89, move: -22 }, { x: 64, y: 83, move: 16 }, { x: 81, y: 90, move: -14 },
] as const;

type GalleryFrameSpot = (typeof galleryFrameSpots)[number];
type ArtworkShape = "portrait" | "square" | "landscape";

function GalleryArtwork({ piece, spot, selected, onSelect }: {
  piece: SharedArtwork;
  spot: GalleryFrameSpot;
  selected: boolean;
  onSelect: () => void;
}) {
  const [shape, setShape] = useState<ArtworkShape>("square");
  const widthFactor = shape === "landscape" ? 1.23 : shape === "portrait" ? .76 : .95;
  const heightFactor = shape === "landscape" ? .7 : shape === "portrait" ? 1.1 : .94;
  const presentation = spot.surface === "partition" ? "shadow" : stringSeed(piece.id) % 2 ? "wire" : "shadow";
  const style = {
    "--frame-x": `${spot.x}%`,
    "--frame-y": `${spot.y}%`,
    "--frame-width": `${spot.width * widthFactor}%`,
    "--frame-height": `${spot.height * heightFactor}%`,
  } as CSSProperties;
  return (
    <button className={`gallery-frame-art art-${spot.surface} art-${presentation} art-shape-${shape}${selected ? " selected" : ""}`} style={style} type="button" onClick={onSelect} aria-label={`${piece.artist}의 작품 보기`}>
      <img src={piece.artworkDataUrl} alt="" onLoad={(event) => {
        const ratio = event.currentTarget.naturalWidth / Math.max(1, event.currentTarget.naturalHeight);
        setShape(ratio > 1.18 ? "landscape" : ratio < .84 ? "portrait" : "square");
      }} />
    </button>
  );
}

function GalleryVisitor({ friend, index }: { friend: MapMember; index: number }) {
  const spot = galleryVisitorSpots[index % galleryVisitorSpots.length];
  const style = {
    "--visitor-x": `${spot.x}%`,
    "--visitor-y": `${spot.y}%`,
    "--visitor-move": `${spot.move}px`,
    "--visitor-delay": `${-(stringSeed(friend.id) % 6_000)}ms`,
    zIndex: 12 + index,
  } as CSSProperties;
  const displayName = `${friend.nickname || friend.name}${friend.mine ? " · 나" : ""}`;
  return (
    <div className="gallery-visitor" style={style}>
      <span title={`${friend.className ? `${friend.className} · ` : ""}${displayName}`}>{friend.className && <small>{friend.className}</small>}<b>{displayName}</b></span>
      <Character profile={{ name: friend.name, nickname: friend.nickname, characterPreset: friend.characterPreset, characterDataUrl: friend.characterDataUrl }} />
    </div>
  );
}

function GalleryPanel({ profile, sessions, sharedGallery, activeFriends, isHost, onRemove }: {
  profile: Profile;
  sessions: WorkSession[];
  sharedGallery: SharedArtwork[];
  activeFriends: SharedFriend[];
  isHost: boolean;
  onRemove: (sessionId: string) => Promise<void>;
}) {
  const [room, setRoom] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const roomCount = Math.max(1, Math.ceil(sharedGallery.length / galleryFrameSpots.length));
  const safeRoom = Math.min(room, roomCount - 1);
  const artworks = sharedGallery.slice(safeRoom * galleryFrameSpots.length, (safeRoom + 1) * galleryFrameSpots.length);
  const selected = artworks.find((piece) => piece.id === selectedId) ?? artworks[0];
  const canRemove = selected && (isHost || selected.artistProfileId === profile.id || sessions.some((session) => session.id === selected.id));
  const own: MapMember = {
    id: profile.id ?? "mine",
    name: profile.name,
    nickname: profile.nickname,
    characterPreset: profile.characterPreset,
    characterDataUrl: profile.characterDataUrl,
    mode: "idle",
    category: "free",
    startedAt: 0,
    message: "",
    className: profile.className,
    mine: true,
  };
  const visitors: MapMember[] = [own, ...activeFriends.filter((friend) => friend.id !== profile.id)].slice(0, galleryVisitorSpots.length);
  return (
    <div className="panel-stack section-panel gallery-panel">
      <header className="section-header gallery-heading"><div><p className="eyebrow">OTHER THAN WORKS GALLERY</p><h2>우리가 시작한 그림들</h2></div><span>{sharedGallery.length}점 전시 중</span></header>
      <p className="section-description">완성도 대신 오늘 남긴 흔적을 걸어요. 액자를 누르면 작품 이야기를 볼 수 있어요.</p>
      <section className="gallery-map" aria-label="수강생 그림이 액자에 걸린 공동 전시장">
        <img className="gallery-folder-statue" src="/gallery-folder-statue.png" alt="아더댄웍스 폴더 친구 동상" />
        {artworks.map((piece, index) => {
          const spot = galleryFrameSpots[index];
          return <GalleryArtwork piece={piece} spot={spot} selected={selected?.id === piece.id} onSelect={() => setSelectedId(piece.id)} key={piece.id} />;
        })}
        <div className="gallery-visitors">{visitors.map((friend, index) => <GalleryVisitor friend={friend} index={index} key={friend.id} />)}</div>
        {!artworks.length && <p className="gallery-map-empty">첫 그림을 기다리는 빈 전시장이에요.</p>}
      </section>
      {roomCount > 1 && <nav className="gallery-room-pager" aria-label="전시장 방 이동"><button type="button" disabled={safeRoom === 0} onClick={() => { setRoom((value) => Math.max(0, value - 1)); setSelectedId(null); }}>이전 방</button><span>{safeRoom + 1} / {roomCount}</span><button type="button" disabled={safeRoom === roomCount - 1} onClick={() => { setRoom((value) => Math.min(roomCount - 1, value + 1)); setSelectedId(null); }}>다음 방</button></nav>}
      {selected ? <section className="paper-card gallery-caption">
        <img src={selected.artworkDataUrl} alt={selected.note || `${selected.artist}의 그림`} />
        <div><p className="eyebrow">선택한 작품</p><b>{selected.note || categoryTitle(selected.category)}</b><span>{selected.artist} · {categoryTitle(selected.category)} · {minutesFor(selected.seconds)}분</span></div>
        {canRemove && <button type="button" disabled={removing} onClick={async () => {
          if (!window.confirm("이 그림을 전시장에서 내릴까요? 작업 기록에는 그대로 남아요.")) return;
          try { setRemoving(true); setRemoveError(""); await onRemove(selected.id); setSelectedId(null); }
          catch (error) { setRemoveError(error instanceof Error ? error.message : "전시에서 내리지 못했어요."); }
          finally { setRemoving(false); }
        }}>{removing ? "내리는 중" : "전시에서 내리기"}</button>}
      </section> : <p className="gallery-invite">집중을 마치고 오늘의 그림을 올리면 이 액자에 전시돼요.</p>}
      {removeError && <p className="error-message" role="alert">{removeError}</p>}
    </div>
  );
}

function RosterManager({ students, classes, onClassCode, onAddClass, onReset, onRemove }: {
  students: RosterSnapshot["students"];
  classes: RosterSnapshot["classes"];
  onClassCode: (classId: string, classCode: string) => Promise<void>;
  onAddClass: (name: string, classCode: string) => Promise<void>;
  onReset: (studentId: string) => Promise<void>;
  onRemove: (studentId: string) => Promise<void>;
}) {
  const [classNameDraft, setClassNameDraft] = useState("");
  const [classCodeDraft, setClassCodeDraft] = useState("");
  const [codeDrafts, setCodeDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  return (
    <section className="paper-card roster-manager">
      <div className="card-title-row"><div><p className="eyebrow">선생님 계정 전용</p><h2>반 · 수강생 관리</h2></div><span>{classes.length}개 반 · {students.filter((student) => student.claimed).length}명</span></div>
      <p className="roster-guide">수강생은 Google 로그인 후 반과 닉네임을 직접 정해요. 이곳에서는 반 코드와 들어온 수강생만 관리하면 돼요.</p>
      <div className="class-manager-list">{classes.map((item) => <article key={item.id}>
        <div><b>{item.name}</b><small>{students.filter((student) => student.classId === item.id && student.claimed).length}명 참여</small></div>
        <div className="class-code-display"><code>{item.code || "코드 재설정 필요"}</code>{item.code && <button type="button" onClick={async () => { await navigator.clipboard.writeText(item.code!); setNotice(`${item.name} 코드를 복사했어요.`); }}>복사</button>}</div>
        <div className="class-code-update"><input className="text-input" value={codeDrafts[item.id] ?? ""} maxLength={20} onChange={(event) => setCodeDrafts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="새 코드 4~20자" aria-label={`${item.name} 새 코드`} /><button className="secondary-button" type="button" disabled={saving || (codeDrafts[item.id] ?? "").trim().length < 4} onClick={async () => {
          const nextCode = (codeDrafts[item.id] ?? "").trim();
          try { setSaving(true); setError(""); setNotice(""); await onClassCode(item.id, nextCode); setNotice(`${item.name} 코드를 바꿨어요.`); setCodeDrafts((current) => ({ ...current, [item.id]: "" })); }
          catch (codeError) { setError(codeError instanceof Error ? codeError.message : "반 코드를 바꾸지 못했어요."); }
          finally { setSaving(false); }
        }}>변경</button></div>
      </article>)}</div>
      <div className="roster-divider" />
      <div className="roster-subheading"><b>새 반 만들기</b><span>반별 코드 사용</span></div>
      <div className="new-class-form"><input className="text-input" value={classNameDraft} maxLength={20} onChange={(event) => setClassNameDraft(event.target.value)} placeholder="반 이름" aria-label="새 반 이름" /><input className="text-input" value={classCodeDraft} maxLength={20} onChange={(event) => setClassCodeDraft(event.target.value)} placeholder="반 코드 4자 이상" aria-label="새 반 코드" /><button className="primary-button" type="button" disabled={saving} onClick={async () => {
        try { setSaving(true); setError(""); setNotice(""); if (!classNameDraft.trim()) throw new Error("반 이름을 적어주세요."); if (classCodeDraft.trim().length < 4) throw new Error("반 코드를 네 글자 이상 적어주세요."); await onAddClass(classNameDraft.trim(), classCodeDraft.trim()); setNotice(`${classNameDraft.trim()}을 만들었어요.`); setClassNameDraft(""); setClassCodeDraft(""); }
        catch (classError) { setError(classError instanceof Error ? classError.message : "반을 만들지 못했어요."); }
        finally { setSaving(false); }
      }}>반 추가</button></div>
      {notice && <p className="success-message">{notice}</p>}
      {error && <p className="error-message" role="alert">{error}</p>}
      <div className="roster-divider" />
      <div className="roster-subheading"><b>참여한 수강생</b><span>닉네임 · 반</span></div>
      <div className="roster-list">
        {students.filter((student) => student.claimed || student.nickname).map((student) => <article key={student.id}>
          <span>{(student.nickname || student.legalName).slice(0, 1)}</span>
          <div><b>{student.nickname || student.legalName}</b><small>{student.className || "반 미지정"}{student.claimed ? " · 연결됨" : " · 다시 연결 대기"}</small></div>
          <div className="roster-row-actions">{student.claimed && <button className="reset-student" type="button" disabled={saving} onClick={async () => {
            if (!window.confirm(`${student.legalName}님의 계정 연결을 바꿀까요?\n캐릭터와 그림 기록은 그대로 유지돼요.`)) return;
            try { setSaving(true); setError(""); setNotice(""); await onReset(student.id); setNotice(`${student.legalName}님이 새 Google 계정으로 다시 연결할 수 있어요.`); }
            catch (resetError) { setError(resetError instanceof Error ? resetError.message : "계정 연결을 바꾸지 못했어요."); }
            finally { setSaving(false); }
          }}>계정 바꾸기</button>}<button type="button" disabled={saving} onClick={async () => {
            if (!window.confirm(`${student.legalName}님을 명단에서 뺄까요?\n기존 그림 기록은 지워지지 않아요.`)) return;
            try { setSaving(true); setError(""); setNotice(""); await onRemove(student.id); }
            catch (removeError) { setError(removeError instanceof Error ? removeError.message : "수강생을 빼지 못했어요."); }
            finally { setSaving(false); }
          }}>빼기</button></div>
        </article>)}
        {!students.some((student) => student.claimed || student.nickname) && <p>아직 참여한 수강생이 없어요.</p>}
      </div>
    </section>
  );
}

function MissionPanel({ sessions, teacherNote, isHost, onTeacherNote }: {
  sessions: WorkSession[];
  teacherNote: string;
  isHost: boolean;
  onTeacherNote: (note: string) => Promise<void>;
}) {
  const progress = sessions.filter((session) => session.category === "sketch" && isThisWeek(new Date(session.completedAt))).length;
  const totalMinutes = sessions.reduce((sum, session) => sum + minutesFor(session.seconds), 0);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(teacherNote);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState("");
  return (
    <div className="panel-stack mission-panel">
      <section className="paper-card mission-card">
        <div className="card-title-row"><span className="eyebrow">이번 주 미션</span><i>스케치</i></div>
        <h2>못생긴 첫 스케치 3번</h2><p>완성하려고 애쓰지 말고, 10분 동안 손을 멈추지 않는 스케치를 세 번 남겨보세요.</p>
        <div className="progress-track orange"><i style={{ width: `${Math.min(100, progress / 3 * 100)}%` }} /></div>
        <div className="card-title-row"><span>이번 주 진행</span><b>{Math.min(progress, 3)} / 3</b></div>
        {progress >= 3 && <strong className="mission-complete">✓ 미션 완료! 이번 주 상장이 기록에 도착했어요.</strong>}
      </section>
      <section className="paper-card teacher-note">
        <span>소</span>
        <div><b>선생님의 한마디</b>{editingNote ? <>
          <textarea value={noteDraft} maxLength={180} onChange={(event) => setNoteDraft(event.target.value)} aria-label="선생님의 한마디" />
          {noteError && <p className="error-message">{noteError}</p>}
          <div className="teacher-note-actions"><button className="secondary-button" type="button" onClick={() => { setEditingNote(false); setNoteDraft(teacherNote); }}>취소</button><button className="primary-button" type="button" disabled={noteSaving || !noteDraft.trim()} onClick={async () => {
            try {
              setNoteSaving(true);
              setNoteError("");
              await onTeacherNote(noteDraft.trim());
              setEditingNote(false);
            } catch (saveError) {
              setNoteError(saveError instanceof Error ? saveError.message : "한마디를 저장하지 못했어요.");
            } finally {
              setNoteSaving(false);
            }
          }}>{noteSaving ? "등록 중…" : "등록"}</button></div>
        </> : <><p>“{teacherNote}”</p>{isHost && <button className="teacher-edit-button" type="button" onClick={() => setEditingNote(true)}>한마디 수정</button>}</>}</div>
      </section>
      <section className="paper-card journey-card"><p className="eyebrow">작업실 성장</p><h2>조금씩 열리는 공간</h2>{milestones.map((milestone, index) => { const open = milestone.minutes <= totalMinutes; return <div className={`journey-row${open ? " open" : ""}`} key={milestone.title}><span>{milestone.icon}</span><div><b>{milestone.title}</b><p>{milestone.detail}</p></div><i>{milestone.minutes === 0 ? "기본" : `${milestone.minutes}분`}</i>{index < milestones.length - 1 && <em />}</div>; })}</section>
    </div>
  );
}

function CompletionModal({ seconds, goalSeconds, category, onClose, onSave }: { seconds: number; goalSeconds: TimerTarget; category: CategoryKey; onClose: () => void; onSave: (artwork: string, note: string) => Promise<void> }) {
  const [artwork, setArtwork] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const achieved = goalSeconds === 0 ? seconds > 0 : seconds >= goalSeconds;
  async function handleArtwork(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try { setLoading(true); setError(""); setArtwork(await prepareArtwork(file)); } catch { setError("그림을 불러오지 못했어요."); } finally { setLoading(false); }
  }
  return (
    <div className="modal-backdrop"><section className="modal completion-modal" role="dialog" aria-modal="true" aria-labelledby="completion-title">
      <button className="close-button" type="button" onClick={onClose} aria-label="돌아가기">×</button>
      <span className="completion-seal">{achieved ? "◆" : "✎"}</span><h2 id="completion-title">{achieved ? (goalSeconds === 0 ? "오늘의 집중을 남겨요" : `오늘의 ${goalSeconds / 60}분을 해냈어요`) : "오늘의 흔적을 남겨요"}</h2><p>{Math.floor(seconds / 60)}분 {seconds % 60}초 · {categoryTitle(category)}</p>
      <label className={`artwork-picker${artwork ? " has-image" : ""}`}>{artwork ? <img src={artwork} alt="선택한 오늘의 그림" /> : <span><b>{loading ? "그림 불러오는 중…" : "오늘 그린 그림 1장 올리기"}</b><small>완성작이 아니어도 괜찮아요</small></span>}<input type="file" accept="image/*" onChange={handleArtwork} /></label>
      <textarea value={note} maxLength={100} onChange={(event) => setNote(event.target.value)} placeholder="오늘 작업에 한마디 (선택)" />
      {error && <p className="error-message">{error}</p>}
      <button className="primary-button wide" disabled={!artwork || loading} type="button" onClick={async () => {
        try {
          setLoading(true);
          setError("");
          await onSave(artwork, note.trim());
        } catch (saveError) {
          setError(saveError instanceof Error ? saveError.message : "작업 기록을 저장하지 못했어요.");
        } finally {
          setLoading(false);
        }
      }}>{loading ? "공동 전시장에 거는 중…" : "작업 기록 저장"}</button>
    </section></div>
  );
}

export default function Home() {
  const [ready, setReady] = useState(false);
  const [roster, setRoster] = useState<RosterSnapshot | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [activeFriends, setActiveFriends] = useState<SharedFriend[]>([]);
  const [sharedGallery, setSharedGallery] = useState<SharedArtwork[]>([]);
  const [tab, setTab] = useState<TabKey>("home");
  const [category, setCategory] = useState<CategoryKey>("sketch");
  const [timerTarget, setTimerTarget] = useState<TimerTarget>(600);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [focusNote, setFocusNote] = useState("");
  const [pauseNotice, setPauseNotice] = useState("");
  const [finishOpen, setFinishOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState("");
  const [teacherNote, setTeacherNote] = useState("완성보다 시작이 중요해요. 이번 주도 가볍게 한 장 꺼내봐요.");
  const [bootKey, setBootKey] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const identityRef = useRef<DeviceIdentity | null>(null);
  const demoMode = useRef(false);
  const runStartedAt = useRef<number | null>(null);
  const elapsedBeforeRun = useRef(0);
  const goalReached = useRef(false);

  const persist = useCallback((nextProfile: Profile | null, nextSessions: WorkSession[]) => {
    setProfile(nextProfile);
    setSessions(nextSessions);
    savePersistedState({ profile: nextProfile, sessions: nextSessions }).catch(() => undefined);
  }, []);

  const refreshCommunity = useCallback(async () => {
    const identity = identityRef.current;
    if (!identity) return;
    const snapshot = await fetchCommunity(identity);
    if (snapshot.profile) persist(snapshot.profile, snapshot.sessions);
    setActiveFriends(snapshot.active);
    setSharedGallery(snapshot.gallery);
    setTeacherNote(snapshot.teacherNote);
    setConnectionMessage("");
  }, [persist]);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      setReady(false);
      if (window.location.hostname === "localhost" && new URLSearchParams(window.location.search).has("enroll")) {
        setRoster({ needsSetup: false, isAdmin: false, linked: false, classes: [
          { id: "demo-class-1", name: "이모티콘 8월반" },
          { id: "demo-class-2", name: "포트폴리오반" },
        ], students: [] });
        setReady(true);
        return;
      }
      if (window.location.hostname === "localhost" && new URLSearchParams(window.location.search).has("demo")) {
        demoMode.current = true;
        const demoProfile: Profile = { id: "demo-moru", name: "모루", nickname: "소랭", characterPreset: "sky", message: "오늘은 선을 가볍게!" };
        const demoSessions: WorkSession[] = [
          { id: "demo-1", completedAt: new Date().toISOString(), seconds: 720, category: "sketch", artworkDataUrl: "/studio-room.jpg", note: "창가의 작은 작업실" },
          { id: "demo-2", completedAt: new Date(Date.now() - 86_400_000 * 2).toISOString(), seconds: 1240, category: "color", artworkDataUrl: "/brand-character.png", note: "파란 폴더 친구 색연습" },
        ];
        setRoster({ needsSetup: false, isAdmin: true, linked: true, nickname: "소랭", classCode: "OTW2026", className: "이모티콘 8월반", classes: [
          { id: "demo-class-1", name: "이모티콘 8월반", code: "OTW2026" },
          { id: "demo-class-2", name: "포트폴리오반", code: "PORT2026" },
        ], students: [
          { id: "demo-student-1", legalName: "은지", nickname: "은지", claimed: true, classId: "demo-class-1", className: "이모티콘 8월반" },
          { id: "demo-student-2", legalName: "세은", nickname: "세은", claimed: true, classId: "demo-class-2", className: "포트폴리오반" },
          { id: "demo-student-3", legalName: "새 수강생", claimed: false, classId: "demo-class-1", className: "이모티콘 8월반" },
        ] });
        setProfile(demoProfile);
        setSessions(demoSessions);
        setActiveFriends([
          { id: "demo-eunji", name: "구름", nickname: "은지", characterPreset: "moss", mode: "working", category: "color", startedAt: Date.now() - 11 * 60_000, message: "빛 연습하는 중" },
          { id: "demo-seeun", name: "콩이", nickname: "세은", characterPreset: "apricot", mode: "idle", category: "free", startedAt: Date.now(), message: "전시 구경 왔어요" },
          { id: "demo-ming", name: "토리", nickname: "밍쵸", characterPreset: "violet", mode: "idle", category: "emoticon", startedAt: Date.now(), message: "표정 세 개 그릴 예정" },
        ]);
        setSharedGallery([
          { ...demoSessions[0], artist: "소랭", artistProfileId: "demo-moru" },
          { ...demoSessions[1], artist: "세은", artistProfileId: "demo-seeun" },
        ]);
        setTeacherNote("완성하려 애쓰기보다 오늘 마음에 든 선 하나를 찾아봐요.");
        setReady(true);
        return;
      }
      const identity = getDeviceIdentity();
      identityRef.current = identity;
      const cached = await loadPersistedState().catch(() => null);
      try {
        const enrollment = await fetchRoster();
        if (cancelled) return;
        setRoster(enrollment);
        if (enrollment.needsSetup || !enrollment.linked) return;
        let snapshot = await fetchCommunity(identity);
        if (!snapshot.profile && cached?.profile) {
          await saveCloudProfile(identity, cached.profile);
          snapshot = await fetchCommunity(identity);
        }
        if (cancelled) return;
        persist(snapshot.profile, snapshot.sessions);
        setActiveFriends(snapshot.active);
        setSharedGallery(snapshot.gallery);
        setTeacherNote(snapshot.teacherNote);
      } catch {
        if (cancelled) return;
        if (cached) persist(cached.profile, cached.sessions);
        setConnectionMessage("공동 작업실 연결을 다시 확인하고 있어요.");
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    initialize();
    const clockTimer = window.setInterval(() => setClock(Date.now()), 1000);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return () => { cancelled = true; window.clearInterval(clockTimer); };
  }, [bootKey, persist]);

  useEffect(() => {
    if (!profile) return;
    const timer = window.setInterval(() => refreshCommunity().catch(() => setConnectionMessage("공동 작업실 연결을 다시 확인하고 있어요.")), 15000);
    return () => window.clearInterval(timer);
  }, [profile, refreshCommunity]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      if (runStartedAt.current) setElapsed(elapsedBeforeRun.current + Math.floor((Date.now() - runStartedAt.current) / 1000));
    }, 250);
    return () => window.clearInterval(timer);
  }, [running]);

  const pauseTimer = useCallback(() => {
    if (runStartedAt.current) {
      const updated = elapsedBeforeRun.current + Math.floor((Date.now() - runStartedAt.current) / 1000);
      setElapsed(updated);
      elapsedBeforeRun.current = updated;
    }
    runStartedAt.current = null;
    setRunning(false);
    const identity = identityRef.current;
    if (identity) sendPresenceStop(identity, category);
  }, [category]);

  useEffect(() => {
    if (!running || timerTarget === 0 || elapsed < timerTarget || goalReached.current) return;
    goalReached.current = true;
    pauseTimer();
    setFinishOpen(true);
  }, [elapsed, pauseTimer, running, timerTarget]);

  useEffect(() => {
    if (!profile) return;
    const announce = () => {
      if (document.visibilityState !== "visible") return;
      const identity = identityRef.current;
      if (!identity) return;
      const startedAt = (runStartedAt.current ?? Date.now()) - elapsedBeforeRun.current * 1000;
      updatePresence(identity, running, category, running ? startedAt : undefined)
        .then(() => refreshCommunity())
        .catch(() => setConnectionMessage("공동 작업실 연결을 다시 확인하고 있어요."));
    };
    announce();
    const timer = window.setInterval(announce, 20000);
    return () => window.clearInterval(timer);
  }, [category, profile, refreshCommunity, running]);

  useEffect(() => {
    function handleVisibility() {
      const identity = identityRef.current;
      if (document.visibilityState !== "visible") {
        if (running) {
          pauseTimer();
          setPauseNotice("앱을 벗어나 집중이 잠시 멈췄어요. 준비되면 다시 이어가세요.");
        }
        if (identity) sendPresenceOffline(identity);
      } else if (identity && profile) {
        updatePresence(identity, false, category).catch(() => undefined);
      }
    }
    function handlePageHide() {
      const identity = identityRef.current;
      if (identity) sendPresenceOffline(identity);
    }
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);
    return () => { document.removeEventListener("visibilitychange", handleVisibility); window.removeEventListener("pagehide", handlePageHide); };
  }, [category, pauseTimer, profile, running]);

  function toggleTimer() {
    if (running) { pauseTimer(); return; }
    if (timerTarget > 0 && elapsed >= timerTarget) goalReached.current = true;
    const focusMessage = focusNote.trim();
    if (focusMessage && profile?.message !== focusMessage) {
      if (demoMode.current) persist({ ...profile, message: focusMessage }, sessions);
      else {
        const identity = identityRef.current;
        if (identity) updateSharedMessage(identity, focusMessage).then((saved) => persist(saved, sessions)).catch(() => undefined);
      }
    }
    setPauseNotice(""); elapsedBeforeRun.current = elapsed; runStartedAt.current = Date.now(); setRunning(true);
  }

  function resetTimer() {
    pauseTimer();
    setElapsed(0);
    elapsedBeforeRun.current = 0;
    runStartedAt.current = null;
    goalReached.current = false;
    setPauseNotice("");
  }

  function openFinish() { pauseTimer(); setFinishOpen(true); }
  async function saveSession(artwork: string, note: string) {
    if (demoMode.current) {
      const saved: WorkSession = { id: crypto.randomUUID(), completedAt: new Date().toISOString(), seconds: elapsed, category, artworkDataUrl: artwork, note };
      persist(profile, [saved, ...sessions]);
      resetTimer();
      setFinishOpen(false);
      return;
    }
    const identity = identityRef.current;
    if (!identity) throw new Error("공동 작업실에 연결하지 못했어요.");
    const next: WorkSession = { id: crypto.randomUUID(), completedAt: new Date().toISOString(), seconds: elapsed, category, artworkDataUrl: artwork, note };
    const saved = await saveCloudSession(identity, next);
    persist(profile, [saved, ...sessions]);
    setElapsed(0);
    elapsedBeforeRun.current = 0;
    runStartedAt.current = null;
    setPauseNotice("");
    goalReached.current = false;
    setFinishOpen(false);
    await refreshCommunity();
  }

  async function saveProfile(nextProfile: Profile) {
    if (demoMode.current) { persist(nextProfile, sessions); return; }
    const identity = identityRef.current;
    if (!identity) throw new Error("공동 작업실에 연결하지 못했어요.");
    const saved = await saveCloudProfile(identity, nextProfile);
    persist(saved, sessions);
    await refreshCommunity();
  }

  async function saveMessage(message: string) {
    if (demoMode.current) { persist({ ...profile!, message }, sessions); return; }
    const identity = identityRef.current;
    if (!identity) throw new Error("공동 작업실에 연결하지 못했어요.");
    const saved = await updateSharedMessage(identity, message);
    persist(saved, sessions);
    await refreshCommunity();
  }

  async function saveTeacherNote(note: string) {
    if (demoMode.current) { setTeacherNote(note); return; }
    setTeacherNote(await updateTeacherNote(note));
  }

  async function saveClassCode(classId: string, classCode: string) {
    if (demoMode.current) {
      setRoster((current) => current ? { ...current, classes: current.classes.map((item) => item.id === classId ? { ...item, code: classCode } : item) } : current);
      return;
    }
    setRoster(await updateRosterClassCode(classId, classCode));
  }

  async function addClass(name: string, classCode: string) {
    if (demoMode.current) {
      setRoster((current) => current ? { ...current, classes: [...current.classes, { id: crypto.randomUUID(), name, code: classCode }] } : current);
      return;
    }
    setRoster(await createRosterClass(name, classCode));
  }

  async function removeStudent(studentId: string) {
    if (demoMode.current) {
      setRoster((current) => current ? { ...current, students: current.students.filter((student) => student.id !== studentId) } : current);
      return;
    }
    setRoster(await removeRosterStudent(studentId));
  }

  async function resetStudent(studentId: string) {
    if (demoMode.current) {
      setRoster((current) => current ? { ...current, students: current.students.map((student) => student.id === studentId ? { ...student, claimed: false } : student) } : current);
      return;
    }
    setRoster(await resetRosterStudent(studentId));
  }

  async function removeArtwork(sessionId: string) {
    if (demoMode.current) {
      setSharedGallery((current) => current.filter((piece) => piece.id !== sessionId));
      return;
    }
    await removeGalleryArtwork(sessionId);
    setSharedGallery((current) => current.filter((piece) => piece.id !== sessionId));
  }

  if (!ready) return <main className="app-loading"><DefaultCharacter /><p>작업실 문을 여는 중…</p></main>;
  if (roster && (roster.needsSetup || !roster.linked)) return <Enrollment snapshot={roster} onComplete={() => setBootKey((value) => value + 1)} />;
  if (!profile) return <Onboarding onComplete={saveProfile} />;

  return (
    <main className="app-shell">
      <header className="brand-bar">
        <button type="button" onClick={() => setTab("home")} aria-label="작업실 홈"><span className="brand-mark">O</span><span>OTHER THAN<br /><b>WORKS</b></span></button>
            <button className="profile-chip" type="button" onClick={() => setProfileOpen(true)} aria-label="내 캐릭터 바꾸기"><Character profile={profile} compact /><span>{profile.className && <em>{profile.className}</em>}<b>{profile.nickname || profile.name}</b><small>{profile.name} · 캐릭터 바꾸기</small></span></button>
      </header>
      {connectionMessage && <div className="connection-banner">{connectionMessage}</div>}
      <div className="app-content">
        {tab === "home" && <HomePanel profile={profile} sessions={sessions} teacherNote={teacherNote} onNavigate={setTab} />}
        {tab === "focus" && <FocusPanel profile={profile} elapsed={elapsed} timerTarget={timerTarget} running={running} category={category} focusNote={focusNote} pauseNotice={pauseNotice} onCategory={setCategory} onFocusNote={setFocusNote} onTimerTarget={(target) => { if (!running && elapsed === 0) { setTimerTarget(target); goalReached.current = false; } }} onToggle={toggleTimer} onFinish={openFinish} onReset={resetTimer} />}
        {tab === "together" && <TogetherPanel profile={profile} activeFriends={activeFriends} running={running} elapsed={elapsed} category={category} clock={clock} onMessage={saveMessage} />}
        {tab === "records" && <RecordsPanel sessions={sessions} teacherNote={teacherNote} isHost={Boolean(roster?.isAdmin)} students={roster?.students ?? []} classes={roster?.classes ?? []} onTeacherNote={saveTeacherNote} onClassCode={saveClassCode} onAddClass={addClass} onResetStudent={resetStudent} onRemoveStudent={removeStudent} />}
        {tab === "gallery" && <GalleryPanel profile={profile} sessions={sessions} sharedGallery={sharedGallery} activeFriends={activeFriends} isHost={Boolean(roster?.isAdmin)} onRemove={removeArtwork} />}
      </div>
      <nav className="bottom-nav" aria-label="주요 메뉴">
        {([
          ["home", "마을"], ["focus", running ? "집중 중" : "집중"], ["together", "아더댄웍스"], ["records", roster?.isAdmin ? "기록·관리" : "기록"], ["gallery", "전시"],
        ] as Array<[TabKey, string]>).map(([key, label]) => <button type="button" key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}><span aria-hidden="true" />{label}</button>)}
      </nav>
      {finishOpen && <CompletionModal seconds={elapsed} goalSeconds={timerTarget} category={category} onClose={() => setFinishOpen(false)} onSave={saveSession} />}
      {profileOpen && <ProfileEditor profile={profile} onClose={() => setProfileOpen(false)} onSave={saveProfile} />}
    </main>
  );
}
