import type {
  DailyJournal,
  ReflectionRecord,
  ReflectionResult,
  ReflectionSource,
  Task,
  TomatoSession,
  WeeklyReflectionRecord,
} from "@/types";
import { offsetDay } from "./date";

export const mockJournal =
  "今天上午看 GEN-0，看得有点慢，中间几次想刷手机，不过最后还是看完了。下午高数拖了一会儿才开始。我发现自己很喜欢 GeneralistAI 那种问题驱动的科研方式。";

export const demoHistorySeeds = [
  { title: "整理书桌和书架", highlight: "收拾出一块能坐下来的地方", tomatoes: 1 },
  { title: "晨读半小时", highlight: "早起读完了计划里的那一章", tomatoes: 5 },
  { title: "做一只黏土小番茄", highlight: "手里真的多了一只小番茄", tomatoes: 12 },
  { title: "精读论文的方法部分", highlight: "读得慢，也没有假装看懂", tomatoes: 3 },
  { title: "出门慢跑十五分钟", highlight: "换好鞋以后，事情就容易了些", tomatoes: 8 },
  { title: "照着昨天的约定跑一小段", highlight: "昨天说的小事，今天真的做了", tomatoes: 2 },
  { title: "晚饭后散步", highlight: "散步时想起了很久没联系的人", tomatoes: 10 },
  { title: "验证异常实验结果", highlight: "意外的数据值得再看一眼", tomatoes: 6 },
  { title: "学做番茄炖牛腩", highlight: "第一次做的新菜，最后端上了桌", tomatoes: 4 },
  { title: "读完论文结论并做摘记", highlight: "忙乱的一天，也留下了九颗番茄", tomatoes: 9 },
] as const;

type DemoTaskInput = {
  title: string;
  estimatedTomatoes: number;
  completed: boolean;
  tomatoDurations?: Array<"small" | "large">;
  sourceKey?: string;
};

type DemoDayInput = {
  date: string;
  journal: string;
  tasks: DemoTaskInput[];
  result: ReflectionResult;
  star?: boolean;
};

export type DemoHistoryDay = {
  date: string;
  tasks: Task[];
  tomatoes: TomatoSession[];
  journal: DailyJournal;
  reflection: ReflectionRecord;
  star: boolean;
};

export type DemoHistoryFixtures = {
  days: DemoHistoryDay[];
  settings: Array<{ key: string; value: string }>;
  weeklyReflection: WeeklyReflectionRecord;
};

const actionSource: ReflectionSource = {
  title: "如何让一个拖延了六年的人，在2分钟内开始行动？ - 知乎",
  excerpt: "意识到该做一件事，觉得有点难，先干点别的缓缓。",
  author: "玛蒂卡",
  voteCount: 11,
  url: "https://zhuanlan.zhihu.com/p/2074952094763820273",
  materialType: "search_excerpt",
  origin: "search",
};

const readingSource: ReflectionSource = {
  title: "刚开始接触科研，如何高效阅读文献并找到关键信息？ - 知乎",
  excerpt: "没有阅读目的时，每个细节看起来都很重要。",
  voteCount: 4,
  url: "https://www.zhihu.com/question/1952011857373173490/answer/2076275294479054258",
  materialType: "search_excerpt",
  origin: "search",
};

const experimentSource: ReflectionSource = {
  title: "科研过程中如何保证数据的准确性和可靠性？ - 知乎",
  excerpt: "当结果出现异常时，可以沿着完整记录一步步回到原始数据。",
  author: "爱学习的T先生",
  voteCount: 6,
  url: "https://www.zhihu.com/question/2761788495/answer/2070850445984248659",
  materialType: "search_excerpt",
  origin: "search",
};

const savedConnectionSource: ReflectionSource = {
  title: "多年不联系的朋友突然找你，八成是这3个原因，想明白了再回复 - 知乎",
  excerpt: "当今社会生存压力太大了，每个人都在忙着谋生。",
  author: "优创视角",
  voteCount: 96,
  url: "https://zhuanlan.zhihu.com/p/296286053",
  materialType: "search_excerpt",
  origin: "favorite",
  savedAt: 1_714_780_800,
};

const savedExperimentSource: ReflectionSource = {
  title: experimentSource.title,
  excerpt: experimentSource.excerpt,
  author: experimentSource.author,
  voteCount: experimentSource.voteCount,
  url: experimentSource.url,
  materialType: "search_excerpt",
  origin: "favorite",
  savedAt: 1_722_124_800,
};

function highlight(
  text: string,
  evidence: string,
  heading: "今日闪耀瞬间" | "今天留下的话" = "今日闪耀瞬间",
  summary = text,
): ReflectionResult {
  return {
    schemaVersion: 2,
    summary,
    achievements: [],
    cards: [{ type: "daily_highlight", heading, text, evidence }],
    externalStatus: { search: "not_needed", favorites: "signed_out" },
  };
}

const inputs: DemoDayInput[] = [
  {
    date: "2026-09-03",
    tasks: [
      { title: "整理书桌和书架", estimatedTomatoes: 2, completed: true, tomatoDurations: ["small", "small"] },
      { title: "给旧笔记分类", estimatedTomatoes: 1, completed: false },
    ],
    journal: "上午把桌上的快递盒、旧草稿和几本摊开的书收了起来。书架只整理了上面两层，旧笔记还堆在椅子上。坐回桌前时，手边终于空出了一块地方，晚上打开电脑也没那么烦了。",
    result: highlight("手边空出一块地方，烦躁也跟着松了一点。", "坐回桌前时，手边终于空出了一块地方，晚上打开电脑也没那么烦了。", "今日闪耀瞬间", "今天完成了 1 / 2 项任务，收获 1 颗番茄。"),
  },
  {
    date: "2026-09-04",
    tasks: [{ title: "晨读半小时", estimatedTomatoes: 1, completed: true, tomatoDurations: ["small"] }],
    journal: "七点多醒来，没有先看消息，烧水的时候读了昨晚放在桌上的书。原本只打算看十页，最后把这一章读完了。出门前在页边记了两个问题，中午想起来时还记得它们。",
    result: highlight("说好十页，却被这一章带着读完了。", "原本只打算看十页，最后把这一章读完了。", "今日闪耀瞬间", "今天完成了 1 / 1 项任务，收获 5 颗番茄。"),
  },
  {
    date: "2026-09-05",
    tasks: [{ title: "做一只黏土小番茄", estimatedTomatoes: 3, completed: true, tomatoDurations: ["small", "small", "small"] }],
    journal: "下午照着视频捏黏土。第一遍把叶子压得太扁，只好重新混了一点绿色。第三轮结束时做出一只不太圆的小番茄，表面还留着指纹。我把它放在显示器旁边，看着有点笨，但挺喜欢。",
    result: highlight("不圆、有指纹，也被你放在了喜欢的位置。", "我把它放在显示器旁边，看着有点笨，但挺喜欢。", "今日闪耀瞬间", "今天完成了 1 / 1 项任务，收获 12 颗番茄。"),
  },
  {
    date: "2026-09-06",
    tasks: [
      { title: "精读论文的方法部分", estimatedTomatoes: 5, completed: true, tomatoDurations: ["small", "small", "small", "small", "small"] },
      { title: "整理方法部分的疑问", estimatedTomatoes: 1, completed: false },
    ],
    journal: "上午继续读那篇论文的方法部分。一个公式来回看了三遍，还是没有完全明白，中间忍不住去搜别人一天能读几篇。看到有人说半小时抓完一篇，我有点怀疑自己是不是不适合做研究。下午把作者的问题、方法和结论各写了一句，至少知道下一次该从哪里接着看。",
    result: {
      schemaVersion: 2,
      summary: "方法部分读得慢，也出现了自我怀疑。你仍然留下了三句能继续使用的笔记。",
      achievements: ["读完论文的方法部分"],
      cards: [{ type: "resonance", signal: "论文读得慢带来的自我怀疑", connection: "你今天卡在公式上，也把阅读速度当成了能力判断。很多研究新手都经历过这段混乱期。", source: readingSource }],
      externalStatus: { search: "ready", favorites: "signed_out" },
    },
  },
  {
    date: "2026-09-07",
    tasks: [{ title: "出门慢跑十五分钟", estimatedTomatoes: 2, completed: true, tomatoDurations: ["small", "small"] }],
    journal: "傍晚一直不想出门，坐在沙发上刷了很久手机。后来只要求自己换鞋下楼，到了楼下再决定跑不跑。走出小区以后慢跑了十五分钟，回来时并没有多厉害，只是觉得开始前那阵拉扯终于停了。",
    result: {
      schemaVersion: 2,
      summary: "最难的是换鞋下楼。你把起点缩小以后，还是完成了十五分钟慢跑。",
      achievements: ["慢跑十五分钟"],
      cards: [{ type: "tomorrow_action", friction: "出门前一直拖着不动", text: "明天仍然只要求自己换好鞋，下楼跑一小段就算完成。", source: actionSource }],
      externalStatus: { search: "ready", favorites: "signed_out" },
    },
  },
  {
    date: "2026-09-08",
    tasks: [
      { title: "照着昨天的约定跑一小段", estimatedTomatoes: 1, completed: true, tomatoDurations: ["small"], sourceKey: "reflection:2026-09-07" },
      { title: "做一顿简单晚饭", estimatedTomatoes: 2, completed: true, tomatoDurations: ["small", "small"] },
    ],
    journal: "下班后看到昨天加进待办的那句话，先换鞋下楼跑了一小圈。回家以后煮了面，又切了番茄和青菜，没有点外卖。跑步只用了十几分钟，晚饭也很普通，不过两件事都没有拖到很晚。",
    result: highlight("答应自己的那点小事，你照做了。", "下班后看到昨天加进待办的那句话，先换鞋下楼跑了一小圈。", "今日闪耀瞬间", "今天完成了 2 / 2 项任务，收获 2 颗番茄。"),
  },
  {
    date: "2026-09-09",
    tasks: [
      { title: "晚饭后散步", estimatedTomatoes: 1, completed: true, tomatoDurations: ["small"] },
      { title: "给很久没联系的朋友发消息", estimatedTomatoes: 1, completed: true, tomatoDurations: ["small"] },
    ],
    journal: "晚饭后绕着小区走了一圈。路过以前常去的便利店时想起大学同学，我们上次聊天已经是春节。我回家给他发了句最近怎么样，他很快回了一张刚下班的照片。我们聊了十来分钟，没有什么大事，但心里松了一点。",
    result: {
      schemaVersion: 2,
      summary: "一次散步带回了一个很久没联系的人，你也真的发出了那句问候。",
      achievements: ["晚饭后散步", "联系老朋友"],
      cards: [{ type: "past_collection", signal: "想起很久没联系的朋友", connection: "你以前收藏过关于关系变淡的回答。今天这句简单的问候，刚好接住了当时没有做的事。", source: savedConnectionSource }],
      externalStatus: { search: "not_needed", favorites: "ready" },
    },
  },
  {
    date: "2026-09-10",
    tasks: [
      { title: "验证异常实验结果", estimatedTomatoes: 4, completed: true, tomatoDurations: ["large", "large", "small", "small"] },
      { title: "补做一组对照实验", estimatedTomatoes: 2, completed: false },
    ],
    journal: "今天重跑前几天那组实验，本来以为异常结果来自参数填错。核对记录以后没发现问题，换了一批样本仍然出现同样的趋势，而且比预期更明显。我有点兴奋，也担心是自己漏掉了条件。先把环境、版本和原始数据都存好，对照实验留到之后补做。",
    result: {
      schemaVersion: 2,
      summary: "异常结果再次出现。你没有急着下结论，先保存了复查需要的条件和数据。",
      achievements: ["复现实验异常趋势"],
      cards: [
        { type: "past_collection", signal: "反常实验结果再次出现", connection: "你以前收藏过保留异常记录的经验，今天保存环境、版本和原始数据正好用上了它。", source: savedExperimentSource },
        { type: "resonance", signal: "面对意外结果时既兴奋又担心", connection: "反常结果需要先复现和排查。你今天没有把一次趋势直接写成结论，这个停顿很重要。", source: experimentSource },
        { type: "tomorrow_action", friction: "还不能判断异常来自新现象还是遗漏条件", text: "明天先补一组只改变单个变量的对照实验，并把结果追加到同一份记录里。", source: experimentSource },
      ],
      externalStatus: { search: "ready", favorites: "ready" },
    },
  },
  {
    date: "2026-09-11",
    tasks: [{ title: "学做番茄炖牛腩", estimatedTomatoes: 3, completed: true, tomatoDurations: ["small", "small", "small"] }],
    journal: "晚上第一次做番茄炖牛腩。切肉比想象中慢，第一锅水也放多了。我尝了一口以后多炖了二十分钟，最后味道还可以。洗锅时厨房有点乱，不过端上桌的那一刻还是很高兴，下次记得把番茄再炒软一点。",
    result: highlight("第一次做就能端上桌，这份高兴值得记下。", "端上桌的那一刻还是很高兴", "今天留下的话", "今天完成了 1 / 1 项任务，收获 4 颗番茄。"),
  },
  {
    date: "2026-09-12",
    tasks: [
      { title: "读完论文结论并做摘记", estimatedTomatoes: 2, completed: true, tomatoDurations: ["small", "small"] },
      { title: "补做对照实验", estimatedTomatoes: 2, completed: true, tomatoDurations: ["large", "large"] },
      { title: "买一周的菜", estimatedTomatoes: 1, completed: true, tomatoDurations: ["small"] },
      { title: "洗衣服并晾好", estimatedTomatoes: 2, completed: false, tomatoDurations: ["small"] },
      { title: "整理本周记录", estimatedTomatoes: 1, completed: false },
    ],
    journal: "今天做的事很杂。上午读完论文结论，给前两天的实验补了两组对照。下午去超市买菜，回来洗了衣服，只晾了一半就接到电话。晚上原本还想整理这周的记录，打开文档后没继续。五件事做完三件，一共九个番茄钟，没清空待办，但实验和生活都往前走了一点。",
    result: {
      summary: "完成了论文摘记、对照实验和买菜，也为没做完的家务与周记录留下了现场。",
      achievements: ["读完论文结论并做摘记", "补做对照实验", "买一周的菜"],
      resonance: {
        stickerTheme: "忙乱的一天，也留下了九颗番茄",
        signal: "待办没有全部完成时容易忽略已经做过的事",
        title: "为什么任务没全部完成，就觉得自己一天什么也没做？",
        excerpt: "未完成项更容易占住注意力。把已经完成的具体事项写下来，有助于恢复对一天的准确判断。",
        author: "KnowYourself",
        voteCount: 1384,
        url: "https://www.zhihu.com/question/390837954",
      },
      improvement: {
        friction: "家务和周记录被临时电话打断",
        insight: "被打断以后保留一个清楚的续接点，会比重新规划整件事更容易开始。",
        sourceTitle: "工作被打断后，怎样快速重新进入状态？",
        sourceUrl: "https://www.zhihu.com/question/271819452",
        tomorrowAction: "明天先把剩下的衣服晾好，再用十分钟整理本周记录。",
      },
    },
    star: true,
  },
];

function timestamp(date: string, hour: number): number {
  return Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00+08:00`);
}

function buildDay(input: DemoDayInput, sourceDates: Map<string, string>): DemoHistoryDay {
  const targetTomatoes = demoHistorySeeds.find(
    (seed) => seed.title === input.tasks[0]?.title,
  )?.tomatoes;
  const taskDurations = input.tasks.map((task) => [...(task.tomatoDurations ?? [])]);
  if (targetTomatoes !== undefined) {
    let remaining = targetTomatoes;
    for (let index = 0; index < taskDurations.length; index += 1) {
      taskDurations[index] = taskDurations[index].slice(0, remaining);
      remaining -= taskDurations[index].length;
    }
    if (remaining > 0) {
      const duration = taskDurations[0]?.at(-1) ?? "small";
      taskDurations[0].push(...Array.from({ length: remaining }, () => duration));
    }
  }
  const tasks = input.tasks.map((task, taskIndex): Task => {
    const durations = taskDurations[taskIndex];
    return {
      id: `demo-history:${input.date}:task:${taskIndex}`,
      title: task.title,
      date: input.date,
      estimatedTomatoes: Math.max(task.estimatedTomatoes, durations.length),
      actualTomatoes: durations.length,
      tomatoSlots: durations.map((_, slot) => slot),
      completed: task.completed,
      createdAt: timestamp(input.date, 8) + taskIndex,
      sourceKey: task.sourceKey?.startsWith("reflection:")
        ? `reflection:${sourceDates.get(task.sourceKey.slice("reflection:".length)) ?? task.sourceKey.slice("reflection:".length)}`
        : task.sourceKey,
    };
  });
  const tomatoes = tasks.flatMap((task, taskIndex) =>
    taskDurations[taskIndex].map((durationType, slot): TomatoSession => ({
      id: `${task.id}:tomato:${slot}`,
      date: input.date,
      durationType,
      plannedMinutes: durationType === "small" ? 25 : 52,
      taskId: task.id,
      slot,
      completedAt: timestamp(input.date, 9) + taskIndex * 60_000 + slot,
      demo: true,
    })),
  );
  const journal: DailyJournal = { date: input.date, content: input.journal, updatedAt: timestamp(input.date, 22), demo: true };
  return {
    date: input.date,
    tasks,
    tomatoes,
    journal,
    reflection: {
      date: input.date,
      result: input.result,
      context: { date: input.date, tasks, tomatoes, journal: input.journal },
      createdAt: timestamp(input.date, 22) + 1,
      source: "mock",
    },
    star: !!input.star,
  };
}

export function buildDemoHistoryFixtures(firstOpenedDate: string): DemoHistoryFixtures {
  const sourceDates = new Map(
    inputs.map((input, index) => [
      input.date,
      offsetDay(firstOpenedDate, index - inputs.length - 1),
    ]),
  );
  const days = inputs.map((input) => buildDay({
    ...input,
    date: sourceDates.get(input.date)!,
  }, sourceDates));
  const weeklyDays = days.slice(0, 7);
  const generatedFromUpdatedAt = Math.max(...weeklyDays.map((day) => day.journal.updatedAt));
  return {
    days,
    settings: days.filter((day) => day.star).map((day) => ({ key: `reflection-star:${day.date}`, value: "true" })),
    weeklyReflection: {
      id: `${weeklyDays[0].date}:${weeklyDays[6].date}`,
      schemaVersion: 1,
      periodStart: weeklyDays[0].date,
      periodEnd: weeklyDays[6].date,
      recordedDays: 7,
      summary: "这一周由几件不大的事组成：先把桌上的杂物收起来，让手边空出一块地方；早上把一章书读完并在页边记下问题；下午捏出一只不太圆的黏土小番茄；读论文时在公式上卡住，转而把作者的问题、方法和结论各写一句；傍晚不想出门，只要求自己换鞋下楼，最后慢跑了十五分钟；第二天跑步和做晚饭都没拖到很晚；晚饭后散步时想起旧同学，发了条消息，聊了十来分钟。整体上，几件被拖延或觉得困难的事，都是在把门槛降到很小之后才动起来的。",
      moments: [
        { date: weeklyDays[0].date, text: "把快递盒、旧草稿和摊开的书收起来后，坐回桌前手边终于空出一块地方，晚上打开电脑也没那么烦。" },
        { date: weeklyDays[2].date, text: "第三轮捏出一只不太圆的小番茄，表面还留着指纹，放在显示器旁边，看着有点笨，但挺喜欢。" },
        { date: weeklyDays[6].date, text: "散步时想起大学同学，回家发了句“最近怎么样”，很快收到一张刚下班的照片，聊了十来分钟，心里松了一点。" },
      ],
      patterns: [
        { text: "面对不想开始的事，先把要求降到极小（只是换鞋下楼、到了再决定跑不跑、先写一句），行动往往就接上了，开始前那阵拉扯也随之停下。", evidenceDates: [weeklyDays[4].date, weeklyDays[5].date] },
        { text: "在读书或读论文时，用“写下来”的方式留住线索——页边记两个问题、给作者的问题/方法/结论各写一句——让中断之后还知道从哪里接着看。", evidenceDates: [weeklyDays[1].date, weeklyDays[3].date] },
      ],
      carryForward: "可以留意一下：当某件事迟迟不想开始时，把第一步缩到多小才刚好动得起来，以及动起来之后感觉有什么变化。",
      generatedFromUpdatedAt,
      createdAt: timestamp("2026-09-09", 23),
      demo: true,
    },
  };
}

export const resonancePlaceholderText = `刚开始接触一项新的研究时，我们很容易把阅读速度当成能力的刻度。同样是一篇论文，有人似乎很快就能讲清楚结论，自己却在一个概念、一张图上停留很久。于是，原本只是一次普通的学习，慢慢变成了对自己的反复追问。

不妨先把“今天必须读完”换成一个更具体的小目标：这篇文章试图回答什么问题？作者为什么选择这种方法？最关键的一张图能够说明什么？带着这三个问题走进文章，即使暂时没有理解全部细节，也能为下一次阅读留下一条清楚的路径。

我试着给每篇文章留一张简短的笔记。第一行写研究的问题，第二行用自己的话描述方法，第三行记下还没有想通的地方。笔记不需要漂亮，也不需要把原文重新抄一遍。它更像是给未来的自己留下几个路标，下次回来时，不必再从第一页重新摸索。

遇到陌生的公式，可以先判断它在论证中起什么作用；遇到不认识的术语，可以先记在旁边，等读完这一小节再集中查找。有些问题需要当场解决，有些则可以留给第二遍阅读。允许自己带着一点不确定继续往前，并不等于敷衍。

专注也未必意味着连续几个小时都不能停下来。给自己留一段安静的时间，只处理眼前的一页、一幅图或者一段推导。时间到了就起身喝点水，看看窗外，再回到笔记里写下一句：这一轮，我比刚才多明白了什么？

有时候，一天结束时留下的不是“读完了三篇”，而是“终于弄懂了一个一直绕不过去的概念”。这样的进展不太显眼，却同样值得记录。没有完成的部分可以安排到明天，已经付出的注意力也不必因为任务没有全部打勾就被抹去。

下一次打开论文时，可以从最小的一步开始：读摘要，看第一张图，再写下一个真正好奇的问题。先让事情开始，再慢慢找到自己的节奏。今天留下的一点理解，或许就是明天继续向前的起点。`;

export const reflectionTemplate: ReflectionResult = {
  summary: "",
  achievements: [],
  resonance: {
    stickerTheme: "第一次做科研，读得慢",
    signal: "科研阅读速度带来的挫败感",
    title: "第一次做科研，一篇论文读一天正常吗？",
    excerpt: "很多科研新人真正需要建立的不是更快的阅读速度，而是一套稳定的信息提取框架。",
    author: "知乎用户",
    voteCount: 2437,
    url: "https://www.zhihu.com/",
  },
  improvement: {
    friction: "任务启动困难",
    insight: "与其要求自己立刻完成整个任务，不如降低启动动作的门槛。",
    sourceTitle: "为什么我们明明知道该做什么，却总是迟迟无法开始？",
    sourceUrl: "https://www.zhihu.com/",
    tomorrowAction: "打开论文后，只要求自己先读 Abstract 和 Figure。",
  },
  question: {
    text: "问题驱动科研和方法驱动科研有什么区别？",
    sourceTitle: "科研中应该从问题出发，还是从方法出发？",
    sourceUrl: "https://www.zhihu.com/",
  },
};

export function isLegacyDemoReflection(result?: ReflectionResult): boolean {
  return !!result
    && result.resonance?.stickerTheme === reflectionTemplate.resonance?.stickerTheme
    && result.resonance?.title === reflectionTemplate.resonance?.title
    && result.resonance?.url === reflectionTemplate.resonance?.url
    && result.improvement?.sourceTitle === reflectionTemplate.improvement?.sourceTitle
    && result.improvement?.sourceUrl === reflectionTemplate.improvement?.sourceUrl
    && result.improvement?.tomorrowAction === reflectionTemplate.improvement?.tomorrowAction
    && result.question?.text === reflectionTemplate.question?.text
    && result.question?.sourceUrl === reflectionTemplate.question?.sourceUrl;
}
