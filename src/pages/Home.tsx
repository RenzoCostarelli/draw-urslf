import HomeCanvas from "../components/Home/HomeCanvas";
import { SoundIndicator } from "../components/Home/SoundIndicator";
import { useSoundToggle } from "../hooks/useSoundToggle";

export default function Home() {
  const { muted, indicatorRef, handleIndicatorClick } = useSoundToggle();

  return (
    <>
      <title>/rnz0_</title>
      <meta name="description" content="Lab de exploración digital" />
      <meta property="og:title" content="/rnz0_" />
      <meta property="og:description" content="Lab de exploración digital" />
      <div className="relative h-svh w-svw">
        <HomeCanvas audioEnabled={true} muted={muted} />
        <div className="absolute w-full h-full inset-0 flex justify-start items-end pointer-events-none">
          <div className="text-neutral-100 flex flex-col gap-1 leading-none pb-2 text-sm">
            <p className="bg-neutral-950">/laboratorio </p>{" "}
            <p className="bg-neutral-950">//de exploración</p>
            <p className="bg-neutral-950">///digital</p>
          </div>
        </div>
        <SoundIndicator
          ref={indicatorRef}
          muted={muted}
          onClick={handleIndicatorClick}
          className="absolute bottom-4 right-4"
        />
      </div>
    </>
  );
}
