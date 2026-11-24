export type UserRole = 'student' | 'teacher';

export type MascotMood = 'idle' | 'confused' | 'happy' | 'alert' | 'paused';

export interface RoomData {
  roomCode: string;
  teacherUid: string;
  chatPaused: boolean;
  resetEpoch: number;
  createdBy: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface SignalData {
  id: string;
  roomId: string;
  ownerUid: string;
  roomTeacherUid: string;
  terminalId: string;
  anonId: string;
  status: 'confused' | 'understood';
  epoch: number;
  expiresAtMs: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface MessageData {
  id: string;
  roomId: string;
  ownerUid: string;
  roomTeacherUid: string;
  terminalId: string;
  anonId: string;
  text: string;
  kind: 'quick' | 'chat';
  epoch: number;
  resolved: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface MuteData {
  id: string;
  roomId: string;
  teacherUid: string;
  terminalId: string;
  anonId: string;
  createdAtMs: number;
}

export interface DocumentPictureInPictureOptions {
  width?: number;
  height?: number;
  disallowReturnToOpener?: boolean;
  preferInitialWindowPlacement?: boolean;
}

export interface DocumentPictureInPicture {
  requestWindow(options?: DocumentPictureInPictureOptions): Promise<Window>;
  readonly window: Window | null;
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture;
  }
}
