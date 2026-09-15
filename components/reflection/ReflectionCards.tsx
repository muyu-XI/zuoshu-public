"use client";
import { useId, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import {
  BookmarkCheck,
  ChevronsDown,
  Clock3,
  Handshake,
  Lightbulb,
  NotebookPen,
  Quote,
  Sparkles,
  Sprout,
  Star,
} from "lucide-react";
import { addTomorrowAction, db } from "@/lib/db";
import { nextDay } from "@/lib/date";
import type {
  DailyContext,
  ReflectionCard,
  ReflectionResult,
  ReflectionSource,
} from "@/types";
import { TreeFruit } from "@/components/mascot/TomatoTree";
import { orderReflectionCards } from "@/lib/reflection-order";
import { sourceTextAfterExcerpt } from "@/lib/reflect/text";

function legacyCards(result: ReflectionResult): ReflectionCard[] {
  const cards: ReflectionCard[] = [];
  if (result.resonance?.title && result.resonance.url) {
    cards.push({
      type: "resonance",
      signal: result.resonance.signal,
      connection: "这条内容曾被选来回应当天的记录。",
      source: {
        title: result.resonance.title,
        excerpt: result.resonance.excerpt,
        fullText: result.resonance.fullText,
        author: result.resonance.author,
        voteCount: result.resonance.voteCount,
        url: result.resonance.url,
        materialType: "search_excerpt",
        origin: "search",
      },
    });
  }
  if (result.improvement?.tomorrowAction && result.improvement.sourceUrl) {
    cards.push({
      type: "tomorrow_action",
      friction: result.improvement.friction,
      text: result.improvement.tomorrowAction,
      source: {
        title: result.improvement.sourceTitle,
        excerpt: result.improvement.insight,
        url: result.improvement.sourceUrl,
        materialType: "search_excerpt",
        origin: "search",
      },
    });
  }
  return cards.length > 0 ? cards : [{
    type: "daily_highlight",
    heading: "今天留下的话",
    text: result.summary,
    evidence: result.summary,
  }];
}

function SourceMeta({ source }: { source: ReflectionSource }) {
  const [expanded, setExpanded] = useState(false);
  const articleId = useId();
  const articleText = source.fullText
    ? sourceTextAfterExcerpt(source.fullText, source.excerpt)
    : "";
  const saved = source.savedAt
    ? new Date(source.savedAt * 1000).toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;
  return (
    <>
      <p className="resonance-meta">
        {[source.author, saved ? `${saved}收藏` : null,
          typeof source.voteCount === "number" ? `${source.voteCount.toLocaleString()} 赞同` : null,
          "来自知乎"].filter(Boolean).join(" · ")}
      </p>
      <blockquote>{source.excerpt}</blockquote>
      {articleText && <>
        <div
          id={articleId}
          className="resonance-article"
          data-expanded={expanded}
          aria-hidden={!expanded}
          inert={!expanded}
        >
          <div className="resonance-article-inner">
            <div className="resonance-full-text">{articleText}</div>
          </div>
        </div>
        <button
          type="button"
          className="resonance-toggle"
          aria-label={expanded ? "收起原文" : "展开原文"}
          title={expanded ? "收起原文" : "展开原文"}
          aria-expanded={expanded}
          aria-controls={articleId}
          onClick={() => setExpanded((current) => !current)}
        >
          <ChevronsDown size={25} aria-hidden="true" />
        </button>
      </>}
    </>
  );
}

export default function ReflectionCards({
  context,
  result,
  readOnly = false,
  guideActions,
}: {
  context: DailyContext;
  result: ReflectionResult;
  source?: "zhihu" | "mock";
  readOnly?: boolean;
  guideActions?: {
    starred: boolean;
    tomorrowAdded: boolean;
    onStar: () => void;
    onAddTomorrow: () => void;
  };
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [starBusy, setStarBusy] = useState(false);
  const [starError, setStarError] = useState("");
  const starKey = `reflection-star:${context.date}`;
  const storedStarred = useLiveQuery(async () =>
    (await db.settings.get(starKey))?.value === "true", [starKey]);
  const sourceKey = `reflection:${context.date}`;
  const storedAdded = useLiveQuery(
    () => db.tasks.where("sourceKey").equals(sourceKey).first(),
    [sourceKey],
  );
  const starred = guideActions ? guideActions.starred : storedStarred;
  const added = guideActions ? guideActions.tomorrowAdded : !!storedAdded;
  const completedTasks = context.tasks.filter((task) => task.completed);
  const cards = orderReflectionCards(
    result.cards?.length ? result.cards : legacyCards(result),
  );

  async function toggleStar() {
    if (guideActions) {
      guideActions.onStar();
      return;
    }
    if (starBusy) return;
    setStarBusy(true);
    setStarError("");
    try {
      await db.transaction("rw", db.settings, async () => {
        const current = await db.settings.get(starKey);
        if (current?.value === "true") await db.settings.delete(starKey);
        else await db.settings.put({ key: starKey, value: "true" });
      });
    } catch {
      setStarError("收藏未保存，请重试。");
    } finally {
      setStarBusy(false);
    }
  }

  async function add(text: string) {
    if (guideActions) {
      guideActions.onAddTomorrow();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await addTomorrowAction(nextDay(context.date), text, sourceKey);
    } catch {
      setError("未能添加，请重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <section className="result-card harvest">
        <h2 className="harvest-title">
          <Sprout size={25} color="#718d48" fill="#c5d79d" aria-hidden="true" />
          今天作数了
          {(!readOnly || guideActions) && <button type="button" className="reflection-star-toggle"
            data-guide-id={guideActions ? "guide-star-reflection" : undefined}
            aria-label={starred ? "取消星标收藏" : "星标收藏"}
            title={starred ? "取消星标收藏" : "星标收藏"}
            aria-pressed={!!starred} disabled={starBusy || starred === undefined}
            onClick={() => void toggleStar()}>
            <Star size={23} fill={starred ? "currentColor" : "none"} aria-hidden="true" />
          </button>}
        </h2>
        {starError && <p role="alert" className="error">{starError}</p>}
        <div className="harvest-stats">
          <div aria-label={`完成 ${completedTasks.length} / ${context.tasks.length} 件待办`}>
            <b><NotebookPen size={25} aria-hidden="true" /><span>{completedTasks.length} / {context.tasks.length}</span></b>
          </div>
          <div aria-label={`收获 ${context.tomatoes.length} 颗番茄`}>
            <b><span className="reflection-tomato" aria-hidden="true"><TreeFruit /></span>× {context.tomatoes.length}</b>
          </div>
          <div aria-label={`专注 ${context.tomatoes.reduce((sum, item) => sum + item.plannedMinutes, 0)} 分钟`}>
            <b><Clock3 size={25} aria-hidden="true" />{context.tomatoes.reduce((sum, item) => sum + item.plannedMinutes, 0)}</b>
          </div>
        </div>
        {completedTasks.length > 0 && <p>完成了{completedTasks.map((task) => task.title).join("、")}</p>}
      </section>

      {cards.map((card, index) => {
        if (card.type === "daily_highlight") {
          return (
            <section className="result-card highlight-card" key={`${card.type}:${index}`}>
              <h2 className="reflection-card-title">
                {card.heading === "今日闪耀瞬间" ? <Sparkles size={25} aria-hidden="true" /> : <Quote size={25} aria-hidden="true" />}
                {card.heading}
              </h2>
              <p>{card.text}</p>
            </section>
          );
        }
        if (card.type === "past_collection") {
          return (
            <section className="result-card collection-card" key={`${card.type}:${card.source.url}`}>
              <h2 className="reflection-card-title"><BookmarkCheck size={25} aria-hidden="true" />你以前收藏过一段内容，今天可能值得重新看看</h2>
              <p className="resonance-signal">{card.connection}</p>
              <h3>{card.source.title}</h3>
              <SourceMeta source={card.source} />
            </section>
          );
        }
        if (card.type === "resonance") {
          return (
            <section className="result-card resonance-card" key={`${card.type}:${card.source.url}`}>
              <h2 className="reflection-card-title"><Handshake size={25} aria-hidden="true" />别人也这样走过</h2>
              <p className="resonance-signal">{card.connection}</p>
              <h3>{card.source.title}</h3>
              <SourceMeta source={card.source} />
            </section>
          );
        }
        return (
          <section className="result-card action-card" key={`${card.type}:${card.source.url}`}>
            <h2 className="reflection-card-title"><Lightbulb size={25} aria-hidden="true" />明天可以试试</h2>
            <p className="action-subtitle">关于「{card.friction}」</p>
            <p>{card.text}</p>
            <button
              className="primary"
              data-guide-id={guideActions ? "guide-add-tomorrow" : undefined}
              disabled={(readOnly && !guideActions) || busy || !!added}
              onClick={() => void add(card.text)}
            >
              {added ? "✓ 已加到明天" : "＋ 加到明天"}
            </button>
            {added && <Link href="/" className="quiet-link">已安排到明天，届时会出现在今日待办 →</Link>}
            {error && <p role="alert" className="error">{error}</p>}
            <p className="reflection-source block mt-4">经验来源：{card.source.title}</p>
          </section>
        );
      })}
    </div>
  );
}
