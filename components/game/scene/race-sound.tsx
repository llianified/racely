'use client';

import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, type Group } from 'three';
import type { DrivingState } from '@/lib/race-dynamics';
import type { RaceAudioEngine } from '@/lib/race-audio';

export function RaceSound({ audio, enabled, running, playerRef, driving }: {
  audio?: RefObject<RaceAudioEngine | null>;
  enabled?: boolean;
  running: boolean;
  playerRef: RefObject<Group | null>;
  driving?: RefObject<DrivingState>;
}) {
  const position = useMemo(() => new Vector3(), []);
  const previous = useMemo(() => new Vector3(), []);
  const screen = useMemo(() => new Vector3(), []);
  const seeded = useRef(false);

  useEffect(() => {
    const engine = audio?.current;
    const sync = () => {
      seeded.current = false;
      engine?.setActive(!!enabled && running && !document.hidden);
    };
    const pause = () => {
      seeded.current = false;
      engine?.setActive(false);
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pagehide', pause);
    window.addEventListener('pageshow', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('pagehide', pause);
      window.removeEventListener('pageshow', sync);
      pause();
    };
  }, [audio, enabled, running]);

  useFrame(({ camera }, delta) => {
    const player = playerRef.current;
    const state = driving?.current;
    if (!enabled || !running || !player || !state || document.hidden) return;
    player.getWorldPosition(position);
    const continuous = seeded.current && delta > 0 && delta < .25;
    const movement = continuous ? position.distanceTo(previous) / delta / 8 : 0;
    previous.copy(position);
    seeded.current = true;
    screen.copy(position).project(camera);
    audio?.current?.update({
      driving: state,
      movement,
      grounded: player.userData.grounded !== false,
      offRoad: player.userData.visualOffRoad ?? state.offRoad,
      impact: player.userData.crashImpact ?? 0,
      pan: screen.x,
      distance: position.distanceTo(camera.position),
    });
  });

  return null;
}
