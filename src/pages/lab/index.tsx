import { labProjects } from "../../data/labProjects";
import LabCard from "../../components/Lab/LabCard";

export default function Lab() {
  return (
    <>
      <title>*.lab /rnz0_</title>
      <meta name="description" content="Laboratorio de exploración digital." />
      <meta property="og:title" content="*.lab /rnz0_" />
      <meta
        property="og:description"
        content="Laboratorio de exploración digital."
      />
      <div>
        <h1 className="text-2xl text-neutral-50">*.lab</h1>
        <div className="flex flex-col gap-2 py-4 px-2">
          {labProjects.map((project) => (
            <LabCard
              key={project.id}
              title={project.title}
              description={project.description}
              href={project.href}
              media={project.media}
            />
          ))}
        </div>
      </div>
    </>
  );
}
