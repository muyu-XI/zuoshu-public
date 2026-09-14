"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bookmark, Check, ChevronDown } from "lucide-react";

type Status = { configured: boolean; connected: boolean };

export default function ZhihuConnection() {
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/zhihu/auth/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((value: Status) => { if (active) setStatus(value); })
      .catch(() => { if (active) setStatus({ configured: false, connected: false }); });
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => {
      active = false;
      document.removeEventListener("pointerdown", close);
    };
  }, []);

  async function refresh() {
    setMessage("");
    const response = await fetch("/api/zhihu/favorites/refresh", { method: "POST" });
    setMessage(response.ok ? "下次回顾会读取最新收藏" : "连接已失效，请重新登录");
  }

  async function disconnect() {
    await fetch("/api/zhihu/auth/logout", { method: "POST" });
    setStatus((current) => current ? { ...current, connected: false } : current);
    setOpen(false);
  }

  if (!status) return <span className="zhihu-connection is-loading">知乎连接中</span>;
  if (!status.connected) {
    const prompt = <>
      <Bookmark size={16} aria-hidden="true" />
      <span className="zhihu-login-copy">
        <strong>知乎登录</strong>
        <small>连接过去的收藏</small>
      </span>
    </>;
    const promptControl = status.configured
      ? <a className="zhihu-connection is-prompt" href="/api/zhihu/auth/start">{prompt}</a>
      : <span className="zhihu-connection is-prompt is-disabled" title="知乎授权尚未配置">{prompt}</span>;
    const brand = document.querySelector<HTMLElement>(".brand");
    return brand ? createPortal(promptControl, brand) : promptControl;
  }

  return (
    <div className="zhihu-connection-wrap" ref={root}>
      <button type="button" className="zhihu-connection is-connected"
        aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Check size={14} aria-hidden="true" />知乎已连接<ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && (
        <div className="zhihu-connection-menu">
          <button type="button" onClick={() => void refresh()}>刷新收藏</button>
          <button type="button" onClick={() => void disconnect()}>退出连接</button>
          {message && <p role="status">{message}</p>}
        </div>
      )}
    </div>
  );
}
