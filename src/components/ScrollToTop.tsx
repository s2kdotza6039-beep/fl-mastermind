import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** Forces every route change to start at the top of the page. */
export const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    // Scroll the window
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    // Scroll the StudioLayout's <main> scroll container too
    document.querySelectorAll<HTMLElement>("main").forEach((el) => {
      el.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }, [pathname]);
  return null;
};
