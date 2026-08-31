import { useState, useCallback } from "react";
import HomeCanvas from "../components/Home/HomeCanvas";

export default function Home() {
  return (
    <>
      <title>/rnz0_</title>
      <meta name="description" content="Lab de exploración digital" />
      <meta property="og:title" content="/rnz0_" />
      <meta property="og:description" content="Lab de exploración digital" />
      <div className="relative h-svh w-svw">
        <HomeCanvas audioEnabled={true} />
        <div className="absolute w-full h-full inset-0 flex justify-start items-end pointer-events-none">
          <div className="text-neutral-100 flex flex-col gap-1 leading-none pb-2 text-sm">
            <p className="bg-neutral-950">/laboratorio </p>{" "}
            <p className="bg-neutral-950">//de exploración</p>
            <p className="bg-neutral-950">///digital</p>
          </div>
        </div>
      </div>
    </>
  );
}
