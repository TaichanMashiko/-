import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      0: { transcript: string };
    };
  };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseLectureRecorderOptions {
  onFinalTranscript: (text: string) => void;
}

export function useLectureRecorder({
  onFinalTranscript,
}: UseLectureRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeechSupported] = useState(() => Boolean(getSpeechRecognitionCtor()));
  const [interimText, setInterimText] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const shouldRestartSpeechRef = useRef(false);
  const onFinalRef = useRef(onFinalTranscript);
  onFinalRef.current = onFinalTranscript;

  useEffect(() => {
    if (!isRecording) return;
    const timer = window.setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isRecording]);

  const startRecording = useCallback(async () => {
    setMicError(null);
    setInterimText('');
    setElapsedSec(0);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }

    // 1. Start MediaRecorder for audio archive if mic is available
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        chunksRef.current = [];
        const recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.onstop = () => {
          if (chunksRef.current.length > 0) {
            const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
            setAudioUrl(URL.createObjectURL(blob));
          }
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        };
        recorder.start(3000);
        mediaRecorderRef.current = recorder;
      }
    } catch {
      setMicError(
        'マイクへのアクセスが許可されませんでした（文字起こしなしで授業記録は継続できます）。'
      );
    }

    // 2. Start Web Speech API continuous Japanese transcription
    const Ctor = getSpeechRecognitionCtor();
    if (Ctor) {
      try {
        const rec = new Ctor();
        rec.lang = 'ja-JP';
        rec.continuous = true;
        rec.interimResults = true;
        shouldRestartSpeechRef.current = true;

        rec.onresult = (event) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i];
            const text = res[0]?.transcript ?? '';
            if (res.isFinal) {
              const cleaned = text.trim();
              if (cleaned) {
                onFinalRef.current(cleaned);
              }
            } else {
              interim += text;
            }
          }
          setInterimText(interim);
        };

        rec.onerror = (e) => {
          if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
            shouldRestartSpeechRef.current = false;
            setMicError(
              '音声認識の権限がありません。ブラウザのマイク許可を確認してください。'
            );
          }
        };

        rec.onend = () => {
          setInterimText('');
          if (shouldRestartSpeechRef.current) {
            try {
              rec.start();
            } catch {
              // ignore restart race
            }
          }
        };

        rec.start();
        recognitionRef.current = rec;
      } catch {
        // Speech recognition start failed; keep session recording active
      }
    }

    setIsRecording(true);
  }, [audioUrl]);

  const stopRecording = useCallback(() => {
    shouldRestartSpeechRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    mediaRecorderRef.current = null;
    setInterimText('');
    setIsRecording(false);
  }, []);

  useEffect(() => {
    return () => {
      shouldRestartSpeechRef.current = false;
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return {
    isRecording,
    isSpeechSupported,
    interimText,
    audioUrl,
    micError,
    elapsedSec,
    startRecording,
    stopRecording,
  };
}
