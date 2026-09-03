type ImageMedia = {
  type: "image";
  src: string;
  alt: string;
};

type VideoMedia = {
  type: "video";
  src: string;
  poster?: string;
};

export type LabMedia = ImageMedia | VideoMedia;

export interface LabProject {
  id: string;
  title: string;
  description: string;
  href: string;
  media?: LabMedia;
}

export const labProjects: LabProject[] = [
  {
    id: "draw-urslf",
    title: "draw-urslf",
    description: "MediaPipe | detección de gestos.",
    href: "/lab/draw-urslf",
  },
];
