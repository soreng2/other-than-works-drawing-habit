export type CategoryKey = "sketch" | "line" | "color" | "emoticon" | "free";
export type CharacterPresetKey = "sky" | "moss" | "apricot" | "rose" | "violet" | "lemon";

export type Profile = {
  id?: string;
  name: string;
  nickname?: string;
  characterPreset?: CharacterPresetKey;
  characterDataUrl?: string;
  message?: string;
  className?: string;
};

export type WorkSession = {
  id: string;
  completedAt: string;
  seconds: number;
  category: CategoryKey;
  artworkDataUrl: string;
  note: string;
};

export type SharedFriend = {
  id: string;
  name: string;
  nickname?: string;
  characterPreset?: CharacterPresetKey;
  characterDataUrl?: string;
  mode: "working" | "idle";
  category: CategoryKey;
  startedAt: number;
  message: string;
  className?: string;
};

export type SharedArtwork = WorkSession & {
  artist: string;
  artistProfileId?: string;
  artistCharacterDataUrl?: string;
};

export type CommunitySnapshot = {
  profile: Profile | null;
  active: SharedFriend[];
  gallery: SharedArtwork[];
  sessions: WorkSession[];
  teacherNote: string;
};

export type DeviceIdentity = {
  profileId: string;
  ownerToken: string;
};

export type RosterStudent = {
  id: string;
  legalName: string;
  nickname?: string;
  claimed: boolean;
  classId?: string;
  className?: string;
  lastSeenAt?: string;
  drawingCount?: number;
  drawingSeconds?: number;
};

export type RosterClass = {
  id: string;
  name: string;
  code?: string;
};

export type RosterSnapshot = {
  needsSetup: boolean;
  isAdmin: boolean;
  linked: boolean;
  nickname?: string;
  classCode?: string;
  className?: string;
  classes: RosterClass[];
  students: RosterStudent[];
};
