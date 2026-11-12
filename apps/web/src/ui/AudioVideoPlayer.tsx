/**
 * AudioVideoPlayer — playback controls for audio_overview and video_overview artifacts.
 * Audio: TTS via Web Speech API (useSpeech hook).
 * Video: scene-by-scene display with narration (no real video, just synchronized scene rendering).
 */
import { useState, useRef } from 'react';
import { useSpeech } from './useSpeech.ts';

interface AudioSegment {
  title: string;
  startSeconds: number;
  script: string;
}

interface VideoScene {
  title: string;
  visual: string;
  narration: string;
}

interface AudioVideoPlayerProps {
  kind: 'audio_overview' | 'video_overview';
  model: { segments?: AudioSegment[]; scenes?: VideoScene[] };
  title: string;
}

export function AudioVideoPlayer({ kind, model, title }: AudioVideoPlayerProps) {
  const speech = useSpeech();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const segments = model.segments ?? [];
  const scenes = model.scenes ?? [];
  const itemCount = segments.length || scenes.length;

  const stopAll = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    speech.stop();
    setIsPlaying(false);
  };

  const playNext = (index: number) => {
    if (index >= itemCount) {
      stopAll();
      setCurrentIndex(0);
      return;
    }
    setCurrentIndex(index);
    const text = kind === 'audio_overview'
      ? segments[index].script
      : scenes[index].narration;
    speech.play(text, () => {
      // After this segment finishes, play the next one
      setTimeout(() => playNext(index + 1), 300);
    });
  };

  const handlePlay = () => {
    if (isPlaying) {
      stopAll();
    } else {
      setIsPlaying(true);
      playNext(currentIndex);
    }
  };

  const handleStop = () => {
    stopAll();
    setCurrentIndex(0);
  };

  const skipTo = (index: number) => {
    stopAll();
    setIsPlaying(true);
    playNext(index);
  };

  if (itemCount === 0) {
    return <p className="empty">No playable content in this artifact.</p>;
  }

  const currentItem = kind === 'audio_overview' ? segments[currentIndex] : scenes[currentIndex];
  const currentAudio = kind === 'audio_overview' ? currentItem as AudioSegment : null;
  const currentVideo = kind === 'video_overview' ? currentItem as VideoScene : null;

  return (
    <div className="audio-video-player">
      <div className="avp-header">
        <h3>{title}</h3>
        <div className="avp-controls">
          <button onClick={handlePlay} disabled={!speech.supported}>
            {isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>
          <button onClick={handleStop}>⏹ Stop</button>
        </div>
      </div>

      {!speech.supported && (
        <p className="hint">Audio playback requires a browser with SpeechSynthesis support.</p>
      )}

      {/* Progress / track list */}
      <ol className="avp-tracklist">
        {Array.from({ length: itemCount }).map((_, i) => {
          const audioItem = kind === 'audio_overview' ? segments[i] as AudioSegment : null;
          const videoItem = kind === 'video_overview' ? scenes[i] as VideoScene : null;
          return (
            <li
              key={i}
              className={`avp-track ${i === currentIndex ? 'active' : ''}`}
              onClick={() => skipTo(i)}
            >
              <span className="avp-track-num">{i + 1}</span>
              <span className="avp-track-title">{(audioItem ?? videoItem)?.title ?? ''}</span>
              {audioItem && (
                <span className="avp-track-time">{audioItem.startSeconds}s</span>
              )}
            </li>
          );
        })}
      </ol>

      {/* Current content display */}
      <div className="avp-current">
        {currentAudio ? (
          <>
            <h4>{currentAudio.title}</h4>
            <p className="avp-script">{currentAudio.script}</p>
          </>
        ) : currentVideo ? (
          <div className="avp-scene">
            <div className="avp-scene-visual">{currentVideo.visual}</div>
            <div className="avp-scene-narration">
              <h4>{currentVideo.title}</h4>
              <p>{currentVideo.narration}</p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
