import HomeCanvas from "../components/Home/HomeCanvas";

export default function Home() {
  return (
    <>
      <title>rnz0_</title>
      <meta name="description" content="Lab de experimentación digital" />
      <meta property="og:title" content="draw-urslf" />
      <meta
        property="og:description"
        content="Lab de experimentación digital"
      />
      <meta property="og:type" content="website" />
      <div className="relative h-screen w-screen bg-neutral-900">
        <div className="p-4 absolute w-full h-full  flex flex-col justify-between">
          <div className="w-full">
            <div>
              <h1 className="leading-none m-0!">rnz0</h1>
            </div>
          </div>
          <div className="w-full">
            <div className="flex items-center justify-between">
              <div className="flex-1"></div>
              <p className="text-xs">Laboratorio de experimentación digital</p>
            </div>
          </div>
        </div>
        <HomeCanvas />
      </div>
    </>
  );
}
