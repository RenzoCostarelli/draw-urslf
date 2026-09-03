import { useEffect, useRef, useState, type RefObject } from "react";

interface UseSoundToggleResult {
  muted: boolean;
  indicatorRef: RefObject<HTMLButtonElement | null>;
  handleIndicatorClick: () => void;
}

// Starts muted. The first interaction anywhere on the page activates sound
// (mirrors the "discover it by accident" behavior already relied on by the
// browser-level AudioContext unlock in CaraModel). After that, only the
// indicator button toggles mute on/off.
export function useSoundToggle(): UseSoundToggleResult {
  const [muted, setMuted] = useState(true);
  const hasActivatedRef = useRef(false);
  const suppressToggleRef = useRef(false);
  const indicatorRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const activateOnce = (e: Event) => {
      if (hasActivatedRef.current) return;
      hasActivatedRef.current = true;
      setMuted(false);

      if (
        indicatorRef.current &&
        e.target instanceof Node &&
        indicatorRef.current.contains(e.target)
      ) {
        // This same click already turned sound on – don't let the click
        // handler below immediately toggle it back off.
        suppressToggleRef.current = true;
      }

      document.removeEventListener("pointerdown", activateOnce);
      document.removeEventListener("keydown", activateOnce);
      document.removeEventListener("touchstart", activateOnce);
    };

    document.addEventListener("pointerdown", activateOnce);
    document.addEventListener("keydown", activateOnce);
    document.addEventListener("touchstart", activateOnce, { passive: true });

    return () => {
      document.removeEventListener("pointerdown", activateOnce);
      document.removeEventListener("keydown", activateOnce);
      document.removeEventListener("touchstart", activateOnce);
    };
  }, []);

  const handleIndicatorClick = () => {
    if (suppressToggleRef.current) {
      suppressToggleRef.current = false;
      return;
    }
    setMuted((m) => !m);
  };

  return { muted, indicatorRef, handleIndicatorClick };
}
