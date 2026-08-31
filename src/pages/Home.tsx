import HomeCanvas from "../components/Home/HomeCanvas";

export default function Home() {
  return (
    <>
      <title>rnz0_</title>
      <meta name="description" content="Lab de experimentación digital" />
      <meta property="og:title" content="rnz0_" />
      <meta
        property="og:description"
        content="Lab de experimentación digital"
      />
      <div className="relative h-svh w-svw">
        <div className="p-4 absolute w-full h-full  flex items-end justify-end">
          <div className="w-full">
            <div className="flex items-center justify-between">
              <div className="flex-1"></div>
              {/* <p className="text-xs tracking-wider">
                laboratorio de experimentación digital.
              </p> */}
            </div>
          </div>
        </div>
        <HomeCanvas />
      </div>
    </>
  );
}
