'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { RaceAudioEngine } from '@/lib/race-audio';

export function useRaceAudio() {
  const audio = useRef<RaceAudioEngine | null>(null);
  const busy = useRef(false);
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState(false);
  const [volume, setVolume] = useState(50);

  useEffect(() => () => {
    audio.current?.dispose();
    audio.current = null;
  }, []);

  const changeVolume = (value: number) => {
    setVolume(value);
    audio.current?.setVolume(value / 100);
  };

  const toggle = async () => {
    if (busy.current) return;
    if (audio.current) {
      audio.current.dispose();
      audio.current = null;
      setEnabled(false);
      return;
    }
    busy.current = true;
    setPending(true);
    let engine: RaceAudioEngine | null = null;
    let context: AudioContext | null = null;
    try {
      const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) throw new Error('Web Audio unavailable');
      context = new AudioContextClass({ latencyHint: 'interactive' });
      engine = new RaceAudioEngine(context, () => {
        if (audio.current !== engine) return;
        engine?.dispose();
        audio.current = null;
        setEnabled(false);
        toast.info('Ketuk tombol suara untuk menyalakannya lagi.');
      });
      audio.current = engine;
      engine.setVolume(volume / 100);
      await engine.unlock();
      if (audio.current === engine) setEnabled(true);
    } catch {
      engine?.dispose();
      if (!engine && context) void context.close().catch(() => {});
      if (audio.current === engine) {
        audio.current = null;
        setEnabled(false);
        toast.info('Suara belum bisa diputar. Coba ketuk lagi atau buka lewat browser.');
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  return { audio, enabled, pending, volume, changeVolume, toggle };
}
