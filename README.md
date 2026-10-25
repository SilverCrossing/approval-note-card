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

## 已知限制

1. 没接 `conversation.approval.detail` 槽，所以卡片里看不到 Tool 的详情/ diff。守卫给的 `displayReason` 里通常已经带了路径或命令，够用；需要时再加。
2. Enter 键的处理是在 textarea 上 `stopPropagation` 拦的。页面把 Enter 绑定成"允许"，这层拦截是否彻底需要实测。
3. 客户端 UI 无法在无浏览器的环境里验证，需要在页面上实际点一遍。
