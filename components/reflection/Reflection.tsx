"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { prettyDate } from "@/lib/date";
import { dailyReflectionMessages } from "@/lib/reflection-loading";
import { startReflectionJob, useReflectionJob } from "@/lib/reflection-job";
import { useToday } from "@/components/layout/AppShell";
import MascotPlaceholder from "@/components/mascot/MascotPlaceholder";
import ReflectionCards from "./ReflectionCards";
import ZhihuConnection from "./ZhihuConnection";
import WeeklyEcho from "./WeeklyEcho";

function currentTimestamp(): number {
  return Date.now();
}

export default function Reflection() {
  const today = useToday();
  return <Journal key={today} date={today} />;
}
function Journal({ date }: { date: string }) {
  const data = useLiveQuery(
    async () => ({
      tasks: await db.tasks.where("date").equals(date).toArray(),
      tomatoes: await db.tomatoes.where("date").equals(date).toArray(),
      journal: await db.journals.get(date),
      record: await db.reflections.get(date),
    }),
    [date],
  );
  const [draft, setDraft] = useState<string[] | null>(null);
  const [page, setPage] = useState(0);
  const [turn, setTurn] = useState(0);
  const [starting, setStarting] = useState(false);
  const [step, setStep] = useState(0);
  const [editing, setEditing] = useState(false);
  const [localError, setLocalError] = useState("");
  const job = useReflectionJob(date);
  const loading = starting || job.status === "running";
  const error = localError || (job.status === "error" ? job.error : "");
  const pages = draft ?? data?.journal?.pages ?? [data?.journal?.content ?? ""];
  const content = pages.join("\n\n");
  const loadingMessages = dailyReflectionMessages(content);
  const characterCount = pages.reduce((total, text) => total + Array.from(text).length, 0);
  function savePages(value: string[]) {
    setDraft(value);
    void db.journals
      .put({ date, content: value.join("\n\n"), pages: value, updatedAt: Date.now() })
      .catch(() => setLocalError("日记保存失败，请重试。"));
  }
  function updateDraft(element: HTMLTextAreaElement) {
    const value = element.value;
    if (element.scrollHeight <= element.clientHeight) {
      savePages(pages.map((text, index) => index === page ? value : text));
      return;
    }
    // Measure using the editor's actual wrapping, including pasted text and newlines.
    const characters = Array.from(value);
    const chunks: string[] = [];
    let offset = 0;
    while (offset < characters.length) {
      let low = 1;
      let high = characters.length - offset;
      let fits = 1;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        element.value = characters.slice(offset, offset + middle).join("");
        if (element.scrollHeight <= element.clientHeight) {
          fits = middle;
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }
      chunks.push(characters.slice(offset, offset + fits).join(""));
      offset += fits;
    }
    element.value = value;
    savePages([...pages.slice(0, page), ...chunks, ...pages.slice(page + 1)]);
    setPage(page + chunks.length - 1);
    setTurn((value) => value + 1);
    requestAnimationFrame(() => {
      const editor = document.getElementById("journal") as HTMLTextAreaElement | null;
      editor?.focus();
      editor?.setSelectionRange(editor.value.length, editor.value.length);
    });
  }
  function turnPage(direction: number) {
    const next = page + direction;
    if (next < 0) return;
    if (direction < 0 && page > 0 && page === pages.length - 1 && !pages[page].trim()) {
      savePages(pages.filter((_, index) => index !== page));
    }
    if (next === pages.length) savePages([...pages, ""]);
    setPage(next);
    setTurn((value) => value + 1);
  }
  useEffect(() => {
    if (!loading) return;
    const timer = setInterval(
      () => setStep((current) => (current + 1) % loadingMessages.length),
      1800,
    );
    return () => clearInterval(timer);
  }, [loading, loadingMessages.length]);
  async function reflect() {
    if (!data || !content.trim() || loading) return;
    setStarting(true);
    setStep(0);
    setLocalError("");
    try {
      const context = {
        date,
        tasks: data.tasks,
        tomatoes: data.tomatoes,
        journal: content,
        excludedFavoriteUrls: (await db.reflections
          .where("date")
          .below(date)
          .reverse()
          .limit(7)
          .toArray())
          .flatMap((record) => record.result.cards ?? [])
          .filter((card) => card.type === "past_collection")
          .map((card) => card.source.url),
      };
      await db.journals.put({ date, content, pages, updatedAt: currentTimestamp() });
      void startReflectionJob(context).catch(() => undefined);
      setEditing(false);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "这次整理没有完成，日记仍在这里，请重试。");
    } finally {
      setStarting(false);
    }
  }
  return (
    <main className="journal-page reflection-page">
      <div className="reflection-eyebrow-row">
        <div className="eyebrow">REFLECTION</div>
        <ZhihuConnection />
      </div>
      <div className="reflection-heading-row">
      <div className="reflection-title-date">
      <h1 className="page-heading">
        {data?.record && !editing && !loading
          ? "每日回顾"
          : "今天发生了什么？"}
      </h1>
      <time className="reflection-date" dateTime={date}>{prettyDate(date)}</time>
      </div>
      {data?.record && !editing && !loading && (
        <button className="secondary journal-open" onClick={() => setEditing(true)}>
          <span className="journal-open-wide">查看 / 修改日记</span>
          <span className="journal-open-narrow">编辑日记</span>
        </button>
      )}
      </div>
      {!data ? (
        <p className="empty">正在读取今天……</p>
      ) : loading ? (
        <div className="loading" role="status">
          <MascotPlaceholder />
          <div className="reflection-loading-copy">
            <span className="reflection-loading-message">{loadingMessages[step]}</span>
            <small>可以先去今天或足迹，回顾会在后台继续。</small>
          </div>
        </div>
      ) : data.record && !editing ? (
        <>
          <ReflectionCards
            context={
              data.record.context ?? {
                date,
                tasks: data.tasks,
                tomatoes: data.tomatoes,
                journal: content,
              }
            }
            result={data.record.result}
            source={data.record.source}
          />
        </>
      ) : (
        <>
          <label className="sr-only" htmlFor="journal">
            今天的日记
          </label>
          <div className="journal-notebook">
          <div className="journal-sheet" key={turn}>
          <textarea
            id="journal"
            maxLength={10000}
            value={pages[page] ?? ""}
            onChange={(e) => {
              if (!(e.nativeEvent as InputEvent).isComposing) updateDraft(e.currentTarget);
              else savePages(pages.map((text, index) => index === page ? e.target.value : text));
            }}
            onCompositionEnd={(e) => updateDraft(e.currentTarget)}
            placeholder={page === 0 ? "今天做了什么？什么让你开心，什么有一点难？像和自己聊聊天一样写下来。" : ""}
          />
          <div className="journal-pagination">
            <button type="button" disabled={page === 0} onClick={() => turnPage(-1)} aria-label="上一页" title="上一页"><ArrowLeft size={19} /></button>
            <span aria-live="polite">{page + 1} / {pages.length}</span>
            <span className="journal-word-count">共 {characterCount} 字</span>
          </div>
          <button type="button" className="journal-fold" onClick={() => turnPage(1)} aria-label={page === pages.length - 1 ? "新增一页" : "下一页"} title={page === pages.length - 1 ? "新增一页" : "下一页"}><ArrowRight size={18} /></button>
          </div>
          </div>
          <button
            className="primary reflection-submit"
            disabled={!content.trim()}
            onClick={() => void reflect()}
          >
            让今天作数
          </button>
          {data.record && (
            <button
              type="button"
              className="journal-return"
              aria-label="返回已有回顾"
              title="返回已有回顾"
              onClick={() => setEditing(false)}
            >
              <ArrowLeft size={24} strokeWidth={2.5} />
            </button>
          )}
        </>
      )}
      <WeeklyEcho today={date} />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </main>
  );
}
