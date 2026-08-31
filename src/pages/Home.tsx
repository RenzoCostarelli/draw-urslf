import { useState, useCallback } from "react";
import HomeCanvas from "../components/Home/HomeCanvas";

export default function Home() {
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [audioState, setAudioState] = useState<AudioContextState | null>(null);

  const handleAudioStateChange = useCallback(
    (state: AudioContextState | null) => setAudioState(state),
    [],
  );

  return (
    <>
      <title>/rnz0</title>
      <meta name="description" content="Lab de experimentación digital" />
      <meta property="og:title" content="rnz0_" />
      <meta
        property="og:description"
        content="Lab de experimentación digital"
      />
      <div className="relative h-svh w-svw">
        {/* Debug audio badge – mobile only */}
        <div className="md:hidden absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <span
            className={`
              font-mono text-[10px] tracking-widest uppercase px-3 py-1 border
              ${audioState === "running" ? "border-green-500 text-green-500" : "border-red-500 text-red-500"}
            `}
          >
            audio: {audioState ?? "—"}
          </span>
        </div>

        {/* <div className="absolute bottom-15 right-5">
          <button
            onClick={() => setAudioEnabled((prev) => !prev)}
            className={`
                  pointer-events-auto bg-white
                  font-mono text-[10px] tracking-[0.2em] uppercase
                  border w-15 h-15 transition-all duration-300 rounded-full cursor-pointer
                  ${
                    audioEnabled
                      ? "border-neutral-300 text-neutral-300"
                      : "border-neutral-700 text-neutral-700 hover:border-neutral-500 hover:text-neutral-500"
                  }
                `}
          >
            <span className="mr-2 inline-block">
              {audioEnabled ? "◉" : "○"}
            </span>
          </button>
        </div> */}
        <HomeCanvas
          audioEnabled={audioEnabled}
          onAudioStateChange={handleAudioStateChange}
        />
      </div>
    </>
  );
}
