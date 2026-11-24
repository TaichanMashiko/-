import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import type {
  LectureSession,
  NoteComment,
  StudentLearningLog,
} from '../types';

const SESSIONS_LS_PREFIX = 'classpulse_sessions_v1_';
const COMMENTS_LS_PREFIX = 'classpulse_comments_v1_';
const LOGS_LS_PREFIX = 'classpulse_student_logs_v1_';

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadLocalSessions(roomId: string): LectureSession[] {
  return safeJsonParse<LectureSession[]>(
    localStorage.getItem(`${SESSIONS_LS_PREFIX}${roomId}`),
    []
  ).sort((a, b) => b.startedAtMs - a.startedAtMs);
}

export function saveLocalSession(roomId: string, session: LectureSession): void {
  const existing = loadLocalSessions(roomId).filter((s) => s.id !== session.id);
  const next = [session, ...existing].sort((a, b) => b.startedAtMs - a.startedAtMs);
  try {
    localStorage.setItem(`${SESSIONS_LS_PREFIX}${roomId}`, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadLocalComments(roomId: string): NoteComment[] {
  return safeJsonParse<NoteComment[]>(
    localStorage.getItem(`${COMMENTS_LS_PREFIX}${roomId}`),
    []
  ).sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export function saveLocalComment(roomId: string, comment: NoteComment): void {
  const existing = loadLocalComments(roomId).filter((c) => c.id !== comment.id);
  const next = [comment, ...existing].sort((a, b) => b.createdAtMs - a.createdAtMs);
  try {
    localStorage.setItem(`${COMMENTS_LS_PREFIX}${roomId}`, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadLocalStudentLogs(roomId: string): StudentLearningLog[] {
  return safeJsonParse<StudentLearningLog[]>(
    localStorage.getItem(`${LOGS_LS_PREFIX}${roomId}`),
    []
  ).sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export function saveLocalStudentLog(
  roomId: string,
  log: StudentLearningLog
): void {
  const existing = loadLocalStudentLogs(roomId).filter((l) => l.id !== log.id);
  const next = [log, ...existing]
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .slice(0, 300);
  try {
    localStorage.setItem(`${LOGS_LS_PREFIX}${roomId}`, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Save or update a LectureSession to Firestore (with localStorage mirror & graceful fallback).
 * Returns true if synced to Firestore, false if local-only fallback was used.
 */
export async function persistLectureSession(
  roomId: string,
  session: LectureSession
): Promise<boolean> {
  saveLocalSession(roomId, session);
  try {
    await setDoc(doc(db, 'rooms', roomId, 'sessions', session.id), {
      ...session,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Subscribe to LectureSessions for a room (Firestore + localStorage merge).
 */
export function subscribeLectureSessions(
  roomId: string,
  onUpdate: (sessions: LectureSession[], cloudSynced: boolean) => void
): () => void {
  // Emit local immediately for instant UX
  onUpdate(loadLocalSessions(roomId), true);

  const q = query(
    collection(db, 'rooms', roomId, 'sessions'),
    orderBy('startedAtMs', 'desc')
  );

  return onSnapshot(
    q,
    (snap) => {
      const cloudSessions: LectureSession[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          roomId: String(data.roomId ?? roomId),
          teacherUid: String(data.teacherUid ?? ''),
          deckId: String(data.deckId ?? ''),
          deckTitle: String(data.deckTitle ?? ''),
          unitKey: String(data.unitKey ?? ''),
          chapter: Number(data.chapter ?? 1),
          chapterName: String(data.chapterName ?? ''),
          sectionLabel: String(data.sectionLabel ?? ''),
          startPage: Number(data.startPage ?? 1),
          endPage: Number(data.endPage ?? 1),
          textbookPageRange: String(data.textbookPageRange ?? ''),
          worksheetPageRange: String(data.worksheetPageRange ?? ''),
          startedAtMs: Number(data.startedAtMs ?? Date.now()),
          endedAtMs: Number(data.endedAtMs ?? 0),
          status: data.status === 'live' ? 'live' : 'ended',
          summary: String(data.summary ?? ''),
          keyPoints: Array.isArray(data.keyPoints)
            ? data.keyPoints.map(String)
            : [],
          segments: Array.isArray(data.segments) ? data.segments : [],
          confusedPages:
            data.confusedPages && typeof data.confusedPages === 'object'
              ? (data.confusedPages as Record<string, number>)
              : {},
          unresolvedQuestionCount: Number(data.unresolvedQuestionCount ?? 0),
          updatedAtMs: Number(data.updatedAtMs ?? Date.now()),
        };
      });
      // Merge with any local-only sessions not yet in cloud
      const cloudIds = new Set(cloudSessions.map((s) => s.id));
      const localOnly = loadLocalSessions(roomId).filter(
        (s) => !cloudIds.has(s.id)
      );
      const merged = [...cloudSessions, ...localOnly].sort(
        (a, b) => b.startedAtMs - a.startedAtMs
      );
      onUpdate(merged, true);
    },
    () => {
      onUpdate(loadLocalSessions(roomId), false);
    }
  );
}

/**
 * Persist a NoteComment on a lecture note segment.
 */
export async function persistNoteComment(
  roomId: string,
  comment: NoteComment
): Promise<boolean> {
  saveLocalComment(roomId, comment);
  try {
    await setDoc(doc(db, 'rooms', roomId, 'noteComments', comment.id), {
      ...comment,
      createdAt: serverTimestamp(),
    });
    return true;
  } catch {
    return false;
  }
}

export async function toggleNoteCommentResolved(
  roomId: string,
  commentId: string,
  resolved: boolean
): Promise<boolean> {
  const local = loadLocalComments(roomId);
  const target = local.find((c) => c.id === commentId);
  if (target) {
    saveLocalComment(roomId, { ...target, resolved });
  }
  try {
    await updateDoc(doc(db, 'rooms', roomId, 'noteComments', commentId), {
      resolved,
    });
    return true;
  } catch {
    return false;
  }
}

export function subscribeNoteComments(
  roomId: string,
  onUpdate: (comments: NoteComment[]) => void
): () => void {
  onUpdate(loadLocalComments(roomId));
  const q = query(
    collection(db, 'rooms', roomId, 'noteComments'),
    orderBy('createdAtMs', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      const cloud: NoteComment[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          roomId: String(data.roomId ?? roomId),
          sessionId: String(data.sessionId ?? ''),
          deckId: String(data.deckId ?? ''),
          slidePage: Number(data.slidePage ?? 1),
          textbookPage:
            data.textbookPage != null ? Number(data.textbookPage) : null,
          worksheetPage: Number(data.worksheetPage ?? 1),
          authorUid: String(data.authorUid ?? ''),
          authorName: String(data.authorName ?? '生徒'),
          authorRole: data.authorRole === 'teacher' ? 'teacher' : 'student',
          kind:
            data.kind === 'reply'
              ? 'reply'
              : data.kind === 'confused'
                ? 'confused'
                : 'question',
          text: String(data.text ?? ''),
          resolved: Boolean(data.resolved),
          aiHint: data.aiHint ? String(data.aiHint) : undefined,
          createdAtMs: Number(data.createdAtMs ?? Date.now()),
        };
      });
      const cloudIds = new Set(cloud.map((c) => c.id));
      const localOnly = loadLocalComments(roomId).filter(
        (c) => !cloudIds.has(c.id)
      );
      onUpdate(
        [...cloud, ...localOnly].sort((a, b) => b.createdAtMs - a.createdAtMs)
      );
    },
    () => {
      onUpdate(loadLocalComments(roomId));
    }
  );
}

/**
 * Record a student personal learning log (confused / understood / question / practice).
 */
export async function persistStudentLog(
  roomId: string,
  log: StudentLearningLog
): Promise<boolean> {
  saveLocalStudentLog(roomId, log);
  try {
    await setDoc(doc(db, 'rooms', roomId, 'studentLogs', log.id), {
      ...log,
      createdAt: serverTimestamp(),
    });
    return true;
  } catch {
    return false;
  }
}

export function subscribeStudentLogs(
  roomId: string,
  studentUid: string | null,
  onUpdate: (logs: StudentLearningLog[]) => void
): () => void {
  const filterLocal = () => {
    const all = loadLocalStudentLogs(roomId);
    return studentUid ? all.filter((l) => l.studentUid === studentUid) : all;
  };
  onUpdate(filterLocal());

  const baseCol = collection(db, 'rooms', roomId, 'studentLogs');
  const q = studentUid
    ? query(baseCol, where('studentUid', '==', studentUid))
    : query(baseCol);

  return onSnapshot(
    q,
    (snap) => {
      const cloud: StudentLearningLog[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          roomId: String(data.roomId ?? roomId),
          studentUid: String(data.studentUid ?? ''),
          studentEmail: String(data.studentEmail ?? ''),
          studentName: String(data.studentName ?? ''),
          deckId: String(data.deckId ?? ''),
          deckTitle: String(data.deckTitle ?? ''),
          chapter: Number(data.chapter ?? 1),
          slidePage: Number(data.slidePage ?? 1),
          textbookPage:
            data.textbookPage != null ? Number(data.textbookPage) : null,
          worksheetPage: Number(data.worksheetPage ?? 1),
          topic: String(data.topic ?? ''),
          eventType:
            (data.eventType as StudentLearningLog['eventType']) ?? 'confused',
          detail: String(data.detail ?? ''),
          createdAtMs: Number(data.createdAtMs ?? Date.now()),
        };
      });
      const cloudIds = new Set(cloud.map((l) => l.id));
      const localOnly = filterLocal().filter((l) => !cloudIds.has(l.id));
      onUpdate(
        [...cloud, ...localOnly].sort((a, b) => b.createdAtMs - a.createdAtMs)
      );
    },
    () => {
      onUpdate(filterLocal());
    }
  );
}

/**
 * Update room's live slide / lecture state gracefully (falls back silently if old rules reject new fields).
 */
export async function syncRoomSlideState(
  roomId: string,
  patch: Record<string, unknown>
): Promise<boolean> {
  try {
    await updateDoc(doc(db, 'rooms', roomId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch {
    return false;
  }
}
