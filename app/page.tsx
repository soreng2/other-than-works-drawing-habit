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
  fetchCommunity,
  getDeviceIdentity,
  saveCloudProfile,
  saveCloudSession,
  sendPresenceStop,
  updatePresence,
  updateSharedMessage,
} from "./lib/community-client";
import type {
  CategoryKey,
  DeviceIdentity,
  Profile,
  SharedArtwork,
  SharedFriend,
  WorkSession,
} from "./lib/community-types";

type PersistedState = {
  profile: Profile | null;
  sessions: WorkSession[];
};

type TabKey = "home" | "together" | "records" | "gallery" | "mission";

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

const milestones = [
  { minutes: 0, title: "작은 책상", detail: "나만의 작업실이 생겼어요.", icon: "▰" },
  { minutes: 60, title: "햇살 창문", detail: "누적 1시간, 창문이 열려요.", icon: "▦" },
  { minutes: 180, title: "재료 선반", detail: "누적 3시간, 도구 자리가 생겨요.", icon: "▥" },
  { minutes: 360, title: "작은 테라스", detail: "누적 6시간, 바깥 공기가 들어와요.", icon: "♧" },
  { minutes: 600, title: "밤의 전시실", detail: "누적 10시간, 비밀 전시실이 열려요.", icon: "☾" },
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
  if (image.naturalWidth !== 1024 || image.naturalHeight !== 1024) {
    throw new Error("캐릭터 이미지는 정확히 1024 × 1024px이어야 해요.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("이미지를 확인하지 못했어요.");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, 1024, 1024).data;
  let transparentPixelFound = false;
  for (let index = 3; index < pixels.length; index += 64) {
    if (pixels[index] < 250) {
      transparentPixelFound = true;
      break;
    }
  }
  if (!transparentPixelFound) {
    throw new Error("배경이 투명한 PNG로 저장해 주세요.");
  }
  return dataUrl;
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

function DefaultCharacter({ compact = false }: { compact?: boolean }) {
  return (
    <img
      className={`character-image official${compact ? " compact" : ""}`}
      src="/brand-character.png"
      alt="아더댄웍스 공식 폴더 캐릭터"
    />
  );
}

function Character({ profile, compact = false }: { profile: Profile; compact?: boolean }) {
  if (profile.characterDataUrl) {
    return <img className={`character-image${compact ? " compact" : ""}`} src={profile.characterDataUrl} alt={`${profile.name} 캐릭터`} />;
  }
  return <DefaultCharacter compact={compact} />;
}

function Onboarding({ onComplete }: { onComplete: (profile: Profile) => Promise<void> }) {
  const [name, setName] = useState("");
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
          {character ? <img src={character} className="character-image onboarding" alt="업로드한 작업친구" /> : <DefaultCharacter />}
          <span className="character-nameplate">{name.trim() || "예시 캐릭터"}</span>
        </div>
        <h2>내 작업친구를 소개해요</h2>
        <p className="subtle">예시 캐릭터로 시작하거나, 직접 그린 캐릭터를 불러올 수 있어요.</p>

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
            <span>PNG 불러오기</span>
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
              await onComplete({ name: name.trim(), characterDataUrl: character });
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
          {character ? <img src={character} className="character-image onboarding" alt="내 작업친구" /> : <DefaultCharacter />}
          <span className="character-nameplate">{name.trim() || "예시 캐릭터"}</span>
        </div>
        <label className="field-label" htmlFor="profile-name">작업친구 이름</label>
        <input id="profile-name" className="text-input" value={name} maxLength={12} onChange={(event) => setName(event.target.value)} />
        <label className="secondary-button file-button profile-file-button">
          <span>1024px 투명 PNG 불러오기</span>
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
              await onSave({ ...profile, name: name.trim(), characterDataUrl: character });
              onClose();
            } catch (saveError) {
              setError(saveError instanceof Error ? saveError.message : "프로필을 저장하지 못했어요.");
            } finally {
              setSaving(false);
            }
          }}
        >{saving ? "친구들에게 알리는 중…" : "공동 작업실에 저장"}</button>
        <p className="device-note">저장하면 다른 수강생 화면의 캐릭터도 함께 바뀝니다.</p>
      </section>
    </div>
  );
}

function StudioScene({ profile, totalMinutes }: { profile: Profile; totalMinutes: number }) {
  return (
    <section className="studio-scene" aria-label={`${profile.name}의 개인 작업실`}>
      <span className="scene-label">{profile.name}의 작업실</span>
      {totalMinutes >= 60 && <div className="scene-window"><i /><i /></div>}
      {totalMinutes >= 180 && <div className="scene-shelf"><i /><i /><i /></div>}
      {totalMinutes >= 360 && <div className="scene-plant tall"><span>♧</span></div>}
      <div className="scene-desk"><span /><i /><i /></div>
      <div className="character-shadow" />
      <div className="scene-character"><Character profile={profile} /></div>
      <span className="scene-nameplate">{profile.name}</span>
      <div className="scene-plant"><span>♧</span></div>
    </section>
  );
}

function HomePanel({
  profile,
  sessions,
  elapsed,
  running,
  category,
  pauseNotice,
  onCategory,
  onToggle,
  onFinish,
}: {
  profile: Profile;
  sessions: WorkSession[];
  elapsed: number;
  running: boolean;
  category: CategoryKey;
  pauseNotice: string;
  onCategory: (key: CategoryKey) => void;
  onToggle: () => void;
  onFinish: () => void;
}) {
  const totalMinutes = sessions.reduce((sum, session) => sum + minutesFor(session.seconds), 0);
  const todayMinutes = sessions.filter((session) => isSameDay(new Date(session.completedAt), new Date())).reduce((sum, session) => sum + minutesFor(session.seconds), 0);
  const currentMilestone = [...milestones].reverse().find((item) => item.minutes <= totalMinutes) ?? milestones[0];
  const nextMilestone = milestones.find((item) => item.minutes > totalMinutes);
  const milestoneProgress = nextMilestone
    ? Math.max(0, Math.min(1, (totalMinutes - currentMilestone.minutes) / (nextMilestone.minutes - currentMilestone.minutes)))
    : 1;
  const timerProgress = Math.min(1, elapsed / 600);
  const timerStyle = { "--timer-progress": `${timerProgress * 360}deg` } as CSSProperties;

  return (
    <div className="panel-stack home-panel">
      <header className="home-greeting">
        <div>
          <p className="eyebrow">{new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "long" }).format(new Date())}</p>
          <h2>{profile.name}가 기다리고 있어요</h2>
        </div>
        <div className="today-count"><span>오늘</span><b>{todayMinutes}분</b></div>
      </header>

      <StudioScene profile={profile} totalMinutes={totalMinutes} />

      <section className="paper-card milestone-card">
        <div className="card-title-row"><b>{currentMilestone.icon} {currentMilestone.title}</b><span>누적 {totalMinutes}분</span></div>
        <div className="progress-track"><i style={{ width: `${milestoneProgress * 100}%` }} /></div>
        <p>{nextMilestone ? `${nextMilestone.title}까지 ${Math.max(0, nextMilestone.minutes - totalMinutes)}분` : "작업실의 모든 공간을 발견했어요."}</p>
      </section>

      <section className="work-choice">
        <p className="eyebrow">TODAY&apos;S WORK</p>
        <h3>무슨 작업을 할까요?</h3>
        <div className="pill-scroll">
          {categories.map((item) => (
            <button type="button" key={item.key} onClick={() => onCategory(item.key)} className={`category-pill${category === item.key ? " active" : ""}`}>
              <span>{item.icon}</span>{item.title}
            </button>
          ))}
        </div>
      </section>

      <section className="paper-card timer-card">
        <div className="card-title-row"><b>{categoryTitle(category)}</b><span>{elapsed >= 600 ? "오늘의 10분 완료" : "목표 10분"}</span></div>
        <div className="timer-ring" style={timerStyle}>
          <div className="timer-inner">
            <strong>{formatTimer(elapsed)}</strong>
            <span>{running ? "집중하는 중" : elapsed === 0 ? "준비되면 시작" : "잠시 멈춤"}</span>
          </div>
        </div>
        {pauseNotice && <p className="pause-notice">Ⅱ {pauseNotice}</p>}
        <div className="timer-actions">
          <button className="primary-button" type="button" onClick={onToggle}>{running ? "잠시 멈추기" : elapsed === 0 ? "10분 시작" : "이어서 하기"}</button>
          {elapsed > 0 && <button className="finish-button" type="button" onClick={onFinish} aria-label="작업 끝내기">✓</button>}
        </div>
      </section>
    </div>
  );
}

function DeskFriend({ profile, message, status, mine = false }: { profile: Profile; message: string; status: string; mine?: boolean }) {
  return (
    <article className={`friend-card${mine ? " mine" : ""}`}>
      {mine ? <span className="mine-label">나</span> : <span className="online-dot" />}
      <div className={`friend-message${message ? "" : " empty"}`}>{message || (mine ? "내 메시지를 남겨보세요" : "조용히 작업 중")}</div>
      <div className="desk-scene" aria-label={`${profile.name}가 아이패드 책상에서 작업 중`}>
        <div className="desk-character"><Character profile={profile} /></div>
        <div className="desk-tablet"><span /><i /></div>
        <div className="desk-furniture"><span /><i /><i /><b>{profile.name}</b></div>
      </div>
      <div className="friend-status"><h3>{profile.name}</h3><b>{status}</b></div>
    </article>
  );
}

function TogetherPanel({ profile, activeFriends, running, elapsed, category, clock, onMessage }: { profile: Profile; activeFriends: SharedFriend[]; running: boolean; elapsed: number; category: CategoryKey; clock: number; onMessage: (message: string) => Promise<void> }) {
  const friends = activeFriends.filter((friend) => friend.id !== profile.id);
  const count = friends.length + (running ? 1 : 0);
  const [message, setMessage] = useState(profile.message ?? "");
  const [messageSaving, setMessageSaving] = useState(false);
  const [messageError, setMessageError] = useState("");
  return (
    <div className="panel-stack section-panel">
      <header className="section-header">
        <div><p className="eyebrow">TOGETHER NOW</p><h2>지금 {count}명이 작업 중</h2></div>
        <span className="live-orbit"><i /></span>
      </header>
      <p className="section-description">말을 걸지 않아도, 각자 작업하는 기척만 나누는 조용한 공동 작업실이에요.</p>
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
      <div className="friend-grid">
        {running && (
          <DeskFriend profile={{ ...profile, message }} message={message} status={`${categoryTitle(category)} · ${Math.floor(elapsed / 60)}분째`} mine />
        )}
        {friends.map((friend) => (
          <DeskFriend key={friend.id} profile={{ name: friend.name, characterDataUrl: friend.characterDataUrl }} message={friend.message} status={`${categoryTitle(friend.category)} · ${Math.max(0, Math.floor((clock - friend.startedAt) / 60000))}분째`} />
        ))}
      </div>
      {count === 0 && <div className="empty-state together-empty"><span>♧</span><b>지금은 작업실이 조용해요</b><p>내가 시작하면 다른 수강생 화면에 캐릭터가 나타나요.</p></div>}
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

function RecordsPanel({ sessions }: { sessions: WorkSession[] }) {
  const now = new Date();
  const cells = monthCells(now);
  const thisWeekMinutes = sessions.filter((session) => isThisWeek(new Date(session.completedAt))).reduce((sum, session) => sum + minutesFor(session.seconds), 0);
  const dayCount = new Set(sessions.map((session) => new Date(session.completedAt).toDateString())).size;
  return (
    <div className="panel-stack section-panel">
      <section className="paper-card news-card">
        <p className="eyebrow">WEEKLY STUDIO NEWS</p><h2>이번 주 작업실 소식</h2>
        <div className="award-row"><span>{thisWeekMinutes ? "◆" : "♧"}</span><div><b>{thisWeekMinutes ? "이번 주의 시작 수집가" : "첫 작업을 기다리는 중"}</b><p>{thisWeekMinutes ? `이번 주 ${thisWeekMinutes}분 동안 작업실 불을 켰어요.` : "10분을 시작하면 첫 번째 상장이 도착해요."}</p></div></div>
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
        <p className="eyebrow">DRAWING LOG</p><h2>최근 작업</h2>
        {sessions.length === 0 ? (
          <div className="empty-state"><span>▧</span><b>아직 남긴 그림이 없어요</b><p>작업실에서 타이머를 시작하고 오늘의 그림 한 장을 남겨보세요.</p></div>
        ) : sessions.map((session) => (
          <article className="session-row" key={session.id}>
            <img src={session.artworkDataUrl} alt={session.note || `${categoryTitle(session.category)} 작업`} />
            <div><b>{categoryTitle(session.category)}</b><span>{minutesFor(session.seconds)}분 · {new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", hour: "numeric", minute: "numeric" }).format(new Date(session.completedAt))}</span>{session.note && <p>{session.note}</p>}</div>
            {session.seconds >= 600 && <i>✓</i>}
          </article>
        ))}
      </section>
    </div>
  );
}

function GalleryPanel({ profile, sessions, sharedGallery }: { profile: Profile; sessions: WorkSession[]; sharedGallery: SharedArtwork[] }) {
  const friendsGallery = sharedGallery.filter((piece) => piece.artist !== profile.name || !sessions.some((session) => session.id === piece.id));
  return (
    <div className="panel-stack section-panel gallery-panel">
      <section className="gallery-hero"><p className="eyebrow">WEEKLY EXHIBITION</p><h2>이번 주 우리가<br />시작한 그림들</h2><span>완성도 대신 남긴 흔적을 전시합니다.</span></section>
      {sessions.length > 0 && <section><p className="eyebrow">MY WALL</p><h2>내 그림</h2><div className="my-wall">{sessions.slice(0, 6).map((session) => <article key={session.id}><img src={session.artworkDataUrl} alt={session.note || "내 작업 그림"} /><b>{categoryTitle(session.category)}</b><span>{minutesFor(session.seconds)}분의 그림</span></article>)}</div></section>}
      <section><div className="card-title-row heading-row"><div><p className="eyebrow">OTHER THAN WORKS</p><h2>친구들의 그림</h2></div><span>최근 기록</span></div>
        {friendsGallery.length > 0 ? <div className="gallery-grid">{friendsGallery.map((piece) => <article key={piece.id}><img className="shared-artwork" src={piece.artworkDataUrl} alt={piece.note || `${piece.artist}의 그림`} /><b>{piece.note || categoryTitle(piece.category)}</b><p>{piece.artist} · {categoryTitle(piece.category)} · {minutesFor(piece.seconds)}분</p></article>)}</div> : <div className="empty-state gallery-empty"><span>▧</span><b>첫 전시를 기다리는 중</b><p>누군가 작업을 완료하고 그림을 올리면 이곳에 함께 걸려요.</p></div>}
      </section>
      {sessions.length === 0 && <p className="gallery-invite">첫 기록을 남기면 {profile.name}의 그림도 이 전시장에 걸려요.</p>}
    </div>
  );
}

function MissionPanel({ sessions }: { sessions: WorkSession[] }) {
  const progress = sessions.filter((session) => session.category === "sketch" && isThisWeek(new Date(session.completedAt))).length;
  const totalMinutes = sessions.reduce((sum, session) => sum + minutesFor(session.seconds), 0);
  return (
    <div className="panel-stack section-panel mission-panel">
      <section className="paper-card mission-card">
        <div className="card-title-row"><span className="eyebrow">WEEK 01</span><i>스케치</i></div>
        <h2>못생긴 첫 스케치 3번</h2><p>완성하려고 애쓰지 말고, 10분 동안 손을 멈추지 않는 스케치를 세 번 남겨보세요.</p>
        <div className="progress-track orange"><i style={{ width: `${Math.min(100, progress / 3 * 100)}%` }} /></div>
        <div className="card-title-row"><span>이번 주 진행</span><b>{Math.min(progress, 3)} / 3</b></div>
        {progress >= 3 && <strong className="mission-complete">✓ 미션 완료! 이번 주 상장이 기록에 도착했어요.</strong>}
      </section>
      <section className="paper-card teacher-note"><span>소</span><div><b>선생님의 한마디</b><p>“첫 선이 예쁘지 않아도 괜찮아요. 이번 주에는 시작한 횟수가 작품입니다.”</p></div></section>
      <section className="paper-card journey-card"><p className="eyebrow">STUDIO JOURNEY</p><h2>열리는 작업실</h2>{milestones.map((milestone, index) => { const open = milestone.minutes <= totalMinutes; return <div className={`journey-row${open ? " open" : ""}`} key={milestone.title}><span>{milestone.icon}</span><div><b>{milestone.title}</b><p>{milestone.detail}</p></div><i>{milestone.minutes === 0 ? "기본" : `${milestone.minutes}분`}</i>{index < milestones.length - 1 && <em />}</div>; })}</section>
    </div>
  );
}

function CompletionModal({ seconds, category, onClose, onSave }: { seconds: number; category: CategoryKey; onClose: () => void; onSave: (artwork: string, note: string) => Promise<void> }) {
  const [artwork, setArtwork] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function handleArtwork(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try { setLoading(true); setError(""); setArtwork(await prepareArtwork(file)); } catch { setError("그림을 불러오지 못했어요."); } finally { setLoading(false); }
  }
  return (
    <div className="modal-backdrop"><section className="modal completion-modal" role="dialog" aria-modal="true" aria-labelledby="completion-title">
      <button className="close-button" type="button" onClick={onClose} aria-label="돌아가기">×</button>
      <span className="completion-seal">{seconds >= 600 ? "◆" : "✎"}</span><h2 id="completion-title">{seconds >= 600 ? "오늘의 10분을 해냈어요" : "오늘의 흔적을 남겨요"}</h2><p>{Math.floor(seconds / 60)}분 {seconds % 60}초 · {categoryTitle(category)}</p>
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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [activeFriends, setActiveFriends] = useState<SharedFriend[]>([]);
  const [sharedGallery, setSharedGallery] = useState<SharedArtwork[]>([]);
  const [tab, setTab] = useState<TabKey>("home");
  const [category, setCategory] = useState<CategoryKey>("sketch");
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [pauseNotice, setPauseNotice] = useState("");
  const [finishOpen, setFinishOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState("");
  const [clock, setClock] = useState(() => Date.now());
  const identityRef = useRef<DeviceIdentity | null>(null);
  const runStartedAt = useRef<number | null>(null);
  const elapsedBeforeRun = useRef(0);

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
    setConnectionMessage("");
  }, [persist]);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      const identity = getDeviceIdentity();
      identityRef.current = identity;
      const cached = await loadPersistedState().catch(() => null);
      try {
        let snapshot = await fetchCommunity(identity);
        if (!snapshot.profile && cached?.profile) {
          await saveCloudProfile(identity, cached.profile);
          snapshot = await fetchCommunity(identity);
        }
        if (cancelled) return;
        persist(snapshot.profile, snapshot.sessions);
        setActiveFriends(snapshot.active);
        setSharedGallery(snapshot.gallery);
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
  }, [persist]);

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
    if (!running || !profile) return;
    const announce = () => {
      const identity = identityRef.current;
      if (!identity) return;
      const startedAt = (runStartedAt.current ?? Date.now()) - elapsedBeforeRun.current * 1000;
      updatePresence(identity, true, category, startedAt)
        .then(() => refreshCommunity())
        .catch(() => setConnectionMessage("공동 작업실 연결을 다시 확인하고 있어요."));
    };
    announce();
    const timer = window.setInterval(announce, 20000);
    return () => window.clearInterval(timer);
  }, [category, profile, refreshCommunity, running]);

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState !== "visible" && running) {
        pauseTimer();
        setPauseNotice("앱을 벗어나 집중이 잠시 멈췄어요. 준비되면 다시 이어가세요.");
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handleVisibility);
    return () => { document.removeEventListener("visibilitychange", handleVisibility); window.removeEventListener("pagehide", handleVisibility); };
  }, [pauseTimer, running]);

  function toggleTimer() {
    if (running) { pauseTimer(); return; }
    setPauseNotice(""); elapsedBeforeRun.current = elapsed; runStartedAt.current = Date.now(); setRunning(true);
  }

  function openFinish() { pauseTimer(); setFinishOpen(true); }
  async function saveSession(artwork: string, note: string) {
    const identity = identityRef.current;
    if (!identity) throw new Error("공동 작업실에 연결하지 못했어요.");
    const next: WorkSession = { id: crypto.randomUUID(), completedAt: new Date().toISOString(), seconds: elapsed, category, artworkDataUrl: artwork, note };
    const saved = await saveCloudSession(identity, next);
    persist(profile, [saved, ...sessions]);
    setElapsed(0);
    elapsedBeforeRun.current = 0;
    runStartedAt.current = null;
    setPauseNotice("");
    setFinishOpen(false);
    await refreshCommunity();
  }

  async function saveProfile(nextProfile: Profile) {
    const identity = identityRef.current;
    if (!identity) throw new Error("공동 작업실에 연결하지 못했어요.");
    const saved = await saveCloudProfile(identity, nextProfile);
    persist(saved, sessions);
    await refreshCommunity();
  }

  async function saveMessage(message: string) {
    const identity = identityRef.current;
    if (!identity) throw new Error("공동 작업실에 연결하지 못했어요.");
    const saved = await updateSharedMessage(identity, message);
    persist(saved, sessions);
    await refreshCommunity();
  }

  if (!ready) return <main className="app-loading"><DefaultCharacter /><p>작업실 문을 여는 중…</p></main>;
  if (!profile) return <Onboarding onComplete={saveProfile} />;

  return (
    <main className="app-shell">
      <header className="brand-bar">
        <button type="button" onClick={() => setTab("home")} aria-label="작업실 홈"><span className="brand-mark">O</span><span>OTHER THAN<br /><b>WORKS</b></span></button>
        <button className="profile-chip" type="button" onClick={() => setProfileOpen(true)} aria-label="내 캐릭터 바꾸기"><Character profile={profile} compact /><span><b>{profile.name}</b><small>캐릭터 바꾸기</small></span></button>
      </header>
      {connectionMessage && <div className="connection-banner">{connectionMessage}</div>}
      <div className="app-content">
        {tab === "home" && <HomePanel profile={profile} sessions={sessions} elapsed={elapsed} running={running} category={category} pauseNotice={pauseNotice} onCategory={setCategory} onToggle={toggleTimer} onFinish={openFinish} />}
        {tab === "together" && <TogetherPanel profile={profile} activeFriends={activeFriends} running={running} elapsed={elapsed} category={category} clock={clock} onMessage={saveMessage} />}
        {tab === "records" && <RecordsPanel sessions={sessions} />}
        {tab === "gallery" && <GalleryPanel profile={profile} sessions={sessions} sharedGallery={sharedGallery} />}
        {tab === "mission" && <MissionPanel sessions={sessions} />}
      </div>
      <nav className="bottom-nav" aria-label="주요 메뉴">
        {([
          ["home", "⌂", "작업실"], ["together", "♧", "함께"], ["records", "▦", "기록"], ["gallery", "▧", "전시"], ["mission", "⚑", "미션"],
        ] as Array<[TabKey, string, string]>).map(([key, icon, label]) => <button type="button" key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}><span>{icon}</span>{label}</button>)}
      </nav>
      {finishOpen && <CompletionModal seconds={elapsed} category={category} onClose={() => setFinishOpen(false)} onSave={saveSession} />}
      {profileOpen && <ProfileEditor profile={profile} onClose={() => setProfileOpen(false)} onSave={saveProfile} />}
    </main>
  );
}
