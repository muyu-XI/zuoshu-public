"use client";
import { useEffect } from "react";
export default function Pwa() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* Install is optional; IndexedDB remains available. */
      });
  }, []);
  return null;
}
