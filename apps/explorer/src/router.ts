import { useEffect, useState } from "react";

export function currentPath(): string {
  const h = location.hash.replace(/^#\/?/, "");
  return h.split("?")[0] ?? "";
}

export function navigate(path: string) {
  const q = location.hash.split("?")[1];
  location.hash = `#/${path}${q ? `?${q}` : ""}`;
}

export function usePath(): string {
  const [p, setP] = useState(currentPath());
  useEffect(() => {
    const on = () => setP(currentPath());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return p;
}
