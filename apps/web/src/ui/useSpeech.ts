/**
 * useSpeech — Text-to-Speech hook using the Web Speech API.
 * Provides play, pause, resume, and stop controls for artifact audio.
 * Falls back gracefully when SpeechSynthesis is unavailable.
 */
import { useState, useRef, useCallback, useEffect } from 'react';

export interface SpeechState {
  isPlaying: boolean;
  isPaused: boolean;
  supported: boolean;
}

export function useSpeech() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [supported] = useState(
    typeof window !== 'undefined' && 'speechSynthesis' in window,
  );
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  const stop = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
    setIsPaused(false);
  }, []);

  const play = useCallback(
    (text: string, onEnd?: () => void) => {
      if (!supported || !text.trim()) return;
      stop();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1;
      utter.pitch = 1;
      utter.volume = 1;
      utter.onend = () => {
        setIsPlaying(false);
        setIsPaused(false);
        onEnd?.();
      };
      utter.onerror = () => {
        setIsPlaying(false);
        setIsPaused(false);
        onEnd?.();
      };
      utterRef.current = utter;
      window.speechSynthesis.speak(utter);
      setIsPlaying(true);
      setIsPaused(false);
    },
    [supported, stop],
  );

  const pause = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window && isPlaying && !isPaused) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  }, [isPlaying, isPaused]);

  const resume = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window && isPlaying && isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    }
  }, [isPlaying, isPaused]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return { play, pause, resume, stop, isPlaying, isPaused, supported };
}
