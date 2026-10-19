# 0001. 门禁规则只有一份，前端只消费服务端结论

状态：已采纳
日期：2026-10-19

## 背景

同一套门禁规则需要在四个地方出现：后端在流转时拦截，任务详情要说明还差什么，仪表盘要列出被阻塞的任务，前端要决定按钮能不能点。四个地方各写一份计数，就会漂移：后端放行、按钮禁用；或者仪表盘把任务列为阻塞，流转却成功。

规格、验证、追溯三道门禁的阈值必须只有一个来源，否则任何一次调整都要同时改四处，且没有测试能保证它们一致。

## 决策

把状态机、阈值和判定写成纯函数，放在 `packages/shared/src/task-policy.ts`，不依赖 Nest 与 Prisma：

- 规格去空白后至少 20 字，非空验收标准至少 3 条。
- `review → done` 至少 1 条 `passed` 验证，且至少 1 条 AI 会话或人工记录不少于 20 字。
- `evaluateTransition` 返回 `allowed`、第一个失败门禁的 `code` 与全部 `reasons`；`availableTransitions` 按状态机列出候选流转及判断结果。
- `summarizeSpecGate` / `summarizeCompletionGate` 提供展示用的计数与达标标记，判定本身也从这里派生。

使用方式固定：

- 后端 `TaskStatusService` 调用 `evaluateTransition`，规格不达标返回 422 `SPEC_GATE`，其余门禁失败返回 409。
- 任务详情返回 `availableTransitions` 与 `gate`，计数与阈值直接取自共享函数。
- 仪表盘在单次事务快照里复用 `summarizeSpecGate` / `summarizeCompletionGate`，不另写阻塞判定。
- 前端 `TaskDetailView.vue` 只渲染服务端给的候选流转与原因，不自行判断流转。

## 考虑过的替代方案

- 前端本地预判门禁。前端拿得到规格、验收和记录数，可以在本地算完再禁用按钮。没选：规则会变成前后端两套，阈值调整时必须同步发版，而且前端看不到服务端判定瞬间读到的最新记录。
- 后端各模块自写计数。任务详情、仪表盘、流转入口各自统计「几字、几条」。没选：这正是漂移的来源，测试只能分别验证每个模块，无法保证它们对同一个任务给出同一个结论。
- 为展示单独维护一套规则。展示用宽松口径，拦截用严格口径，让页面先亮起来。没选：用户会看到「可以完成」的按钮，点下去却收到 409，展示与拦截互相矛盾。

## 后果

收益：阈值和状态机只有一处定义，改规则只改 `packages/shared`；后端拦截、详情展示、仪表盘阻塞列表和前端按钮共享同一份结论；纯函数可以直接做单元测试。

代价：`packages/shared` 必须先构建，根 `predev` 依赖这一步；Vite 还要为 CommonJS 包配置 `optimizeDeps.include` 与 `commonjsOptions.include`。有未保存修改时，前端会把流转按钮先置为可点，保存后才由服务端拒绝，用户可能多一次失败反馈。`packages/shared` 自身的 `test` 脚本仍是占位，门禁测试实际放在 `apps/server/src/tasks/task-policy.spec.ts`。

相关：[Day 2 交付说明](../day2.md)
