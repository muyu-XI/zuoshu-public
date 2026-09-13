# 回顾匹配接口

POST /api/reflect 接收 DailyContext（date、tasks、tomatoes、journal），成功直接返回 ReflectionResult。数据契约保留当前 types/index.ts，不要求迁移 IndexedDB。

## 配置

.env.local 中设置 ZHIHU_ACCESS_SECRET，以及 REFLECT_LLM_BASE_URL、REFLECT_LLM_API_KEY、REFLECT_LLM_MODEL。模型配置也兼容现有 LLM_BASE_URL、LLM_API_KEY、LLM_MODEL；非空 REFLECT_LLM_* 优先。所有密钥仅服务端读取。当前默认示例使用 DeepSeek 官方 `https://api.deepseek.com` 与 `deepseek-v4-flash`。用户知乎登录还需设置 ZHIHU_OAUTH_APP_ID、ZHIHU_OAUTH_APP_KEY、ZHIHU_OAUTH_COOKIE_SECRET 和与赛事后台完全一致的 ZHIHU_OAUTH_REDIRECT_URI。

REFLECT_DAILY_LIMIT 控制同一匿名设备每天最多生成几次，默认 10 次，按北京时间自然日重置。浏览器会在本地生成匿名随机 ID；没有该 ID 时退回到 IP 与浏览器请求头组合。服务端只在内存中保存标识哈希，不保存原始 IP。该实现适用于单个长期运行的 Next.js 实例；多实例或 Serverless 部署必须把计数器换成 Redis 等共享原子存储，否则不同实例和重启之间不共享额度。

默认最多保留 3 个日记信号，但只为最重要的一个未解决需求并行发出经验型、方法型两条搜索，每次取 5 条候选。搜索缓存 30 分钟（进程内最多 200 项），相同查询合并并发请求；平台返回频率限制时立即停止，不做自动重试。日流程最多调用两次模型：第一次理解日记和提取闪耀瞬间，第二次仅在确有搜索或收藏候选时匹配材料。整条管道默认 60 秒主动降级，客户端 75 秒停止等待；`edgeone.json` 与路由声明把 Node Functions 外层上限设为 90 秒，为降级响应、冷启动和平台开销留出余量。

未配置模型、知乎缺配置、无结果、鉴权失败、限流或超时时，仍返回不带外部来源的本地回顾，不伪造文章或方法。只有仍未解决的明确困惑、烦躁、迷茫等需求会花费知乎检索额度；开心、成就、普通兴趣、愿望和单纯未完成事项不会触发。

## 请求与响应

请求体上限 256 KiB，按流式 UTF-8 字节计数；journal 非空、最多 10000 字符；tasks 最多 200，tomatoes 最多 500。date 格式 YYYY-MM-DD。兼容旧字段 tasks[].tomatoes 和 tomatoes[].durationMinutes。

新版成功结构包含 `schemaVersion: 2`、summary、achievements、cards 和 externalStatus。cards 可为 past_collection、resonance、tomorrow_action 或 daily_highlight；标题、作者、赞数、来源链接始终绑定开放接口条目，模型不能覆盖。来源须为 HTTPS 知乎链接，材料明确标记为搜索摘要而不是全文。旧版 resonance / improvement 记录仍可在客户端展示。

错误返回 { error, code }：INVALID_REQUEST=400，DAILY_LIMIT/UPSTREAM_RATE_LIMIT=429，UPSTREAM_AUTH/UPSTREAM_ERROR=502，MISSING_CONFIG=503，TIMEOUT=504。达到每日额度时还会返回 limit、remaining、resetAt，并设置 X-RateLimit-* 与 Retry-After 响应头。GET 返回 405。响应 no-store。请求取消停止后续阶段；共享搜索在所有等待者退出后取消。

开发环境 ?debug=1 返回 {result, trace}，包含各阶段和降级轨迹；生产环境忽略该参数。不要向日志写入日记、请求体或密钥。

## 页面接入与兼容

现有按钮通过 lib/reflection-job.ts 启动标签页级后台任务，再由 lib/reflect-client.ts 调用接口。切换 Next 页面不会取消 fetch；回到回顾页会重新订阅同一任务状态。关闭或刷新整个标签页仍会由浏览器终止内存任务。失败显示在原有错误位置，并保留日记和已有回顾。成功保存 `source: "zhihu"`；旧记录缺少该字段时继续兼容展示。`POST /api/reflect/weekly` 接收一个严格的七日周期和最多七篇日记，少于三天时不生成规律判断；结果由客户端存入独立的 weeklyReflections 表。

## 验证

npm test 使用模拟上游运行，不读取 .env.local、不消耗真实额度。npm run build 验证生产构建。经用户授权的真实日记联调应只在本地开发接口执行，并核对耗时、卡片类型与检索次数。
