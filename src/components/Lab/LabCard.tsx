import { Link } from "react-router-dom";
import type { LabMedia } from "../../data/labProjects";

interface LabCardProps {
  title: string;
  description: string;
  href: string;
  media?: LabMedia;
}

export default function LabCard({
  title,
  description,
  href,
  media,
}: LabCardProps) {
  return (
    <Link
      to={href}
      className="text-neutral-150 hover:text-neutral-900 transition-colors duration-400 px-2 relative w-max group"
    >
      <div className="absolute inset-0 w-full h-full bg-amber-50 backdrop-invert-100 scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
      <div className=" relative">
        {media &&
          (media.type === "image" ? (
            <img src={media.src} alt={media.alt} />
          ) : (
            <video
              src={media.src}
              poster={media.poster}
              muted
              autoPlay
              loop
              playsInline
            />
          ))}
        <h3>{title}</h3>
        {/* <p>{description}</p> */}
      </div>
    </Link>
  );
}
