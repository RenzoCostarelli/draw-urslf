import { Outlet } from "react-router-dom";
import Navbar from "../components/Navbar";

export default function RootLayout() {
  return (
    <div className="flex flex-col h-full bg-neutral-950">
      <meta name="robots" content="index, follow" />
      <meta name="theme-color" content="#08060d" />
      <meta property="og:site_name" content="rnz0_" />
      <meta property="og:type" content="website" />
      <meta name="twitter:card" content="summary_large_image" />

      <Navbar />

      <main id="main-content" className=" bg-neutral-950 text-neutral-500">
        <Outlet />
      </main>
    </div>
  );
}
