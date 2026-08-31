import { Outlet } from "react-router-dom";

export default function LabLayout() {
  return (
    <div className="py-10">
      <Outlet />
    </div>
  );
}
