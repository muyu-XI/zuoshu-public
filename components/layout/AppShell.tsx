"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import {
  CalendarDays,
  BookOpen,
  Footprints,
  Sprout,
} from "lucide-react";
import { dateKey } from "@/lib/date";
import { initialize, matureTomato } from "@/lib/db";
import { useReflectionJob } from "@/lib/reflection-job";
import FirstUseGuideProvider from "@/components/onboarding/FirstUseGuide";
const DayContext = createContext("");
export const useToday = () => useContext(DayContext);
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [today, setToday] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const reflectionJob = useReflectionJob(today);
  useEffect(() => {
    const update = () => {
      setToday(dateKey());
      void matureTomato().catch(() => setError("番茄保存失败，请重试。"));
    };
    update();
    const timer = setInterval(update, 1000);
    initialize(dateKey())
      .then(() => setReady(true))
      .catch(() =>
        setError("本地存储无法打开，请允许浏览器保存网站数据后重试。"),
      );
    return () => clearInterval(timer);
  }, []);
  return (
    <DayContext value={today}>
      <FirstUseGuideProvider today={today}>
      <div
        className={`app-shell ${["/", "/orchard", "/reflection", "/history", "/focus"].includes(pathname) ? "garden-shell" : ""}`}
      >
        <header className="brand">
          <Link href="/">
            <Image src="/brand-logo-transparent.png" alt="" width={34} height={34} className="brand-logo" />
            <Image src="/brand-wordmark-transparent.png" alt="作数" width={92} height={52} className="brand-wordmark" />
          </Link>
        </header>
        {error ? (
          <main>
            <p role="alert">{error}</p>
            <button onClick={() => location.reload()}>重试</button>
          </main>
        ) : ready ? (
          <div
            className={`route-stage ${["/", "/reflection", "/history"].includes(pathname) ? "main-tab-stage" : ""}`}
            key={pathname}
          >
            {children}
          </div>
        ) : (
          <main className="empty">正在翻开今天……</main>
        )}
        <nav className="bottom-nav" aria-label="主导航">
          {(() => {
            const items = [
              ["/", "今天", CalendarDays],
              ["/reflection", "回顾", BookOpen],
              ["/history", "足迹", Footprints],
            ] as const;
            const activePath = pathname === "/orchard" ? "/history" : pathname;
            const activeIndex = items.findIndex(([href]) => href === activePath);
            return (
              <>
                <span
                  aria-hidden="true"
                  className="nav-active-pill"
                  style={
                    {
                      "--active-index": Math.max(0, activeIndex),
                    } as CSSProperties
                  }
                />
                {items.map(([href, label, Icon]) => {
                  const I = Icon as typeof Sprout;
                  const active = activePath === href;
                  const reflecting = href === "/reflection" && reflectionJob.status === "running";
                  return (
                    <Link
                      key={href}
                      href={href}
                      data-guide-id={href === "/reflection"
                        ? "guide-open-reflection"
                        : href === "/history"
                          ? "guide-open-history"
                          : undefined}
                      aria-current={active ? (pathname === href ? "page" : "location") : undefined}
                      className={`${active ? "active" : ""}${reflecting ? " is-reflecting" : ""}`}
                      aria-label={reflecting ? "回顾（生成中）" : undefined}
                    >
                      <span className="nav-icon">
                        <I size={21} />
                      </span>
                      <span>{label}</span>
                    </Link>
                  );
                })}
              </>
            );
          })()}
        </nav>
      </div>
      </FirstUseGuideProvider>
    </DayContext>
  );
}
