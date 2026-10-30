# 审批卡 · 拒绝说明（approval-note-card）

给 DSH 的审批卡加一个输入框：拒绝的时候顺手告诉模型**为什么**。

## 它解决什么

原生审批卡只有两个答案。拒绝只等于"否定"，不等于"方向"——模型拿不到理由，就会自己猜：换个工具、换个目录、或者换一个更"权威"的来源（整盘遍历、注册表、系统文件）。这不是它想作恶，是它只能猜。

这个插件在拒绝前，把你写的理由作为**一条用户消息**发给模型：

- 消息权重是用户级（不是工具输出的错误文本），模型默认会照做；
- 模型知道这一次被拒的上下文，不用猜；
- 你可以在里面写任何东西："别用遍历"、"别动系统文件"、"先解释你要做什么"。

## 交互

- **拒绝**：和原生一致，只否定这次调用。
- **拒绝并说明**：先发送输入框里的文字，再拒绝。输入框为空时按钮不可用。
- **允许一次**：和原生一致。
- 输入框里 Enter 发送说明，Shift+Enter 换行，中文输入法composing 期间不触发。

## 组合使用（四件套）

本插件是为下面这套护栏设计的。四个可以单独装，也可以一起装：

| 插件 | 仓库 | 职责 |
|---|---|---|
| `write-approval-guard` | <https://github.com/SilverCrossing/write-approval-guard> | 写操作审批；高危操作二次确认；敏感文件读取审批；判定日志 |
| `outside-access-guard` | <https://github.com/SilverCrossing/outside-access-guard> | 工作区外读/写的审批；敏感位置二次确认；判定日志 |
| `dsh-safety-toolkit` | <https://github.com/SilverCrossing/dsh-safety-toolkit> | `safe_*` 工具：改前快照、语法门禁、失败自动还原、可回滚 |
| `approval-note-card` | 本仓库 | 审批卡加输入框；拒绝时把说明作为用户消息送给模型 |

联动关系：

- 前两个负责**判定**（要不要问、问几次），本插件只负责**问答界面**，不参与任何判定；
- 三者都通过宿主侧的 `approval/request` 瀑布发起审批，本插件在浏览器侧接管渲染，回答仍走同一条瀑布——所以守卫的拦截行为和审计日志完全不受影响；
- `dsh-safety-toolkit` 的写操作同样经过 `write-approval-guard`，因此也会显示这张卡片。

兼容性上唯一的约束见下一节：说明依赖 `steer`，和 `onReject: turn`（拒绝即取消本轮）互斥。

## 安装

```powershell
dsh plugin --profile desktop add github:SilverCrossing/approval-note-card#<commit>
```

它是纯客户端插件：宿主侧那一行是空实现，真正的 UI 在 `client.js` 里注册到 `conversation.composer`。

## 关键约束：不要和"拒绝即取消"一起用

说明是通过 `session.prompt(content, 'steer')` 送进**当前这一轮**的。如果宿主侧守卫在拒绝时取消了本轮（`onReject: turn`），inbox 会被清空，**说明就会丢**。

所以：

- 守卫保持 `onReject: call`（拒绝但不停本轮）→ 说明正常送达；
- 守卫改成 `onReject: turn` → 这条通道失效，需要改走宿主旁路。

## 失败安全

- `/plugins` 里禁用或卸载本插件 → 官方 `ui-approval` 仍在，退回原生卡片。
- 待审批对象的形状变了（`kind` / `answer` / `answerable` 不满足）→ `select` 返回 `null`，同样退回原生卡。
- 说明发送失败 → 卡片保持打开、显示错误，不会出现"拒了但没说明"。

## 日志

本插件**不落盘日志**——纯客户端，碰不到文件系统。四件套里的另外三个（`write-approval-guard`、`outside-access-guard`、`dsh-safety-toolkit`）已经覆盖了绝大多数信息：谁触发的审批、判定结果、`callId` 都在它们各自的日志里。

本插件只留两处间接痕迹：说明原文作为一条用户消息进入会话记录（`[拒绝说明] …`）；守卫日志里有对应的 `outcome: "rejected"` 和 `callId`，但**不含说明文本**。两者按时间对齐，不能按 `callId` join。后续如果确实需要精确归因，再补宿主侧日志。

## 已知限制

1. 没接 `conversation.approval.detail` 槽，所以卡片里看不到 Tool 的详情/ diff。守卫给的 `displayReason` 里通常已经带了路径或命令，够用；需要时再加。
2. Enter 键的处理是在 textarea 上 `stopPropagation` 拦的。页面把 Enter 绑定成"允许"，这层拦截是否彻底需要实测。
3. 客户端 UI 无法在无浏览器的环境里验证，需要在页面上实际点一遍。
