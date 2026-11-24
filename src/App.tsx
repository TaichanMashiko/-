import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { EntryScreen } from './components/EntryScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StudentView } from './components/StudentView';
import { TeacherView } from './components/TeacherView';
import { auth } from './firebase';
import type { UserRole } from './types';
import {
  getOrCreateTerminalIdentity,
  isValidRoomCode,
  normalizeRoomCode,
} from './utils/identity';

function getInitialRoomFromUrl(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const candidate = normalizeRoomCode(params.get('room') || '');
    return isValidRoomCode(candidate) ? candidate : 'CS-101';
  } catch {
    return 'CS-101';
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<UserRole | null>(null);
  const [initialRoomId] = useState<string>(() => getInitialRoomFromUrl());

  const identity = useMemo(() => getOrCreateTerminalIdentity(), []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
      if (!firebaseUser) {
        setActiveRoomId(null);
        setActiveRole(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleEnterRoom = (roomId: string, role: UserRole) => {
    setActiveRoomId(roomId);
    setActiveRole(role);
  };

  const handleLeaveRoom = () => {
    setActiveRoomId(null);
    setActiveRole(null);
  };

  return (
    <ErrorBoundary>
      {!user || !activeRoomId || !activeRole ? (
        <EntryScreen
          user={user}
          authLoading={authLoading}
          anonId={identity.anonId}
          initialRoomId={initialRoomId}
          onEnterRoom={handleEnterRoom}
        />
      ) : activeRole === 'student' ? (
        <StudentView
          user={user}
          roomId={activeRoomId}
          terminalId={identity.terminalId}
          anonId={identity.anonId}
          onLeave={handleLeaveRoom}
        />
      ) : (
        <TeacherView
          user={user}
          roomId={activeRoomId}
          onLeave={handleLeaveRoom}
        />
      )}
    </ErrorBoundary>
  );
}
