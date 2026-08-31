import { NavLink } from "react-router-dom";
import { NAV_ITEMS } from "../../data/navItems";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full flex items-center justify-between px-4 py-3">
      <NavLink
        to="/"
        className="text-sm text-neutral-50 tracking-tight hover:text-neutral-300 transition-colors"
      >
        <span
          className="font-bold
        "
        >
          /
        </span>
        rnz0_
      </NavLink>

      <nav aria-label="Navegación principal">
        <ul className="flex items-center gap-6 list-none m-0 p-0">
          {NAV_ITEMS.map(({ label, href }) => (
            <li key={href}>
              <NavLink
                to={href}
                end
                className={({ isActive }) =>
                  [
                    "text-xs transition-colors",
                    isActive
                      ? "text-neutral-50"
                      : "text-neutral-400 hover:text-neutral-200",
                  ].join(" ")
                }
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
