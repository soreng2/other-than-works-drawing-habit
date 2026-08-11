export type CategoryKey = "sketch" | "line" | "color" | "emoticon" | "free";

export type Profile = {
  id?: string;
  name: string;
  characterDataUrl?: string;
  message?: string;
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
  characterDataUrl?: string;
  category: CategoryKey;
  startedAt: number;
  message: string;
};

export type SharedArtwork = WorkSession & {
  artist: string;
  artistCharacterDataUrl?: string;
};

export type CommunitySnapshot = {
  profile: Profile | null;
  active: SharedFriend[];
  gallery: SharedArtwork[];
  sessions: WorkSession[];
};

export type DeviceIdentity = {
  profileId: string;
  ownerToken: string;
};
