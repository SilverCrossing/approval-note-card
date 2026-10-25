/**
 * approval-note-card — an approval card that also accepts a short note.
 *
 * The stock card (@deepseek-ai/dsh-client-ui-approval) answers with one of two
 * words. That is enough to stop a call, not to tell the model *why* it was
 * stopped, so a rejected call is followed by a guess: the model tries another
 * tool, another directory, or a wider scope. This module adds one optional
 * field and delivers its text to the model as a user message before rejecting
 * the call.
 *
 * It takes over `conversation.composer` at a higher precedence than the stock
 * entry and leaves that package installed. `select` yields `null` whenever the
 * pending interaction is not a well-formed approval, so a DSH change to that
 * shape falls back to the stock card instead of breaking approvals.
 *
 * Delivery uses `session.prompt(content, 'steer')`: the note enters the running
 * turn at the next step. It therefore travels only while the turn is still
 * open. A Host guard that cancels the turn on rejection clears the inbox and
 * the note is lost — that combination is intentionally unsupported here.
 *
 * 中文：给审批卡加一个「拒绝说明」输入框。原生卡只有允许/拒绝两个答案，
 * 拒绝只表示“不行”、不表示“为什么”，模型拿不到方向就只能猜——换工具、
 * 换目录、换一个更大的范围。本插件在拒绝前，把输入框里的文字作为一条
 * 用户消息发给模型。它接管 conversation.composer 但不卸载官方卡：
 * select 返回 null 时自动退回官方卡，审批不会悬空。说明通过 steer 送进
 * 当前轮；若宿主守卫在拒绝时取消本轮（onReject: turn），inbox 会被清空、
 * 说明会丢，这两个能力互斥。
 */
window.__ModuleLoader__.load({
  id: 'approval-note-card',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /**
     * The primitives module carries the host's button styling. It is optional:
     * if the browser module table ever stops exposing it, the card degrades to
     * a styled native button instead of failing to render.
     *
     * 中文：按钮样式优先用宿主提供的 primitives；拿不到就退回自绘的原生
     * 按钮，保证卡片永远能渲染出来，不会因为模块表变化整块白屏。
     */
    let Button = null
    try {
      const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
      if (primitives !== null && primitives !== undefined && typeof primitives.Button === 'function') {
        Button = primitives.Button
      }
    } catch {
      Button = null
    }

    const NS = 'approval-note-card'
    const MAX_NOTE = 2000

    // 中文词典。key 必须与 en 一一对应，缺一个就会在界面上显示成键名。
    const zh = {
      waiting: '等待审批',
      escalation: '工具 {toolName} 请求越权执行',
      reject: '拒绝',
      allowOnce: '允许一次',
      'note.label': '拒绝理由（可选）',
      'note.placeholder': '例如：别用遍历，我不想你看太多文件；或者：先解释你要做什么',
      'note.hint': '填写后会先作为你的消息发给模型，再拒绝这次调用。',
      'note.submit': '拒绝并说明',
      'note.prefix': '[拒绝说明]',
      failed: '说明未能送达，请重试。',
      tooLong: '说明太长（上限 2000 字）。',
    }

    // 英文词典，key 与 zh 完全一致。
    const en = {
      waiting: 'Waiting for approval',
      escalation: 'Tool {toolName} requests privileged execution',
      reject: 'Reject',
      allowOnce: 'Allow once',
      'note.label': 'Reason (optional)',
      'note.placeholder': 'e.g. stop enumerating the whole drive; or: explain what you are doing first',
      'note.hint': 'The note is sent to the model as your message before this call is rejected.',
      'note.submit': 'Reject with note',
      'note.prefix': '[rejection note]',
      failed: 'The note was not delivered. Try again.',
      tooLong: 'The note is too long (2000 characters maximum).',
    }

    // 以下均为内联样式：颜色一律取主题 CSS 变量并带兜底值，
    // 跟随界面亮/暗色切换，不写死具体配色。
    const rootStyle = { display: 'flex', flexDirection: 'column', padding: '8px 16px 12px' }
    const cardStyle = {
      border: '1px solid var(--dsw-alias-state-warn-secondary, #b45309)',
      borderRadius: 'var(--dsw-radius-xl, 14px)',
      background: 'var(--dsw-specific-input-major, #1b1b1f)',
      overflow: 'hidden',
    }
    const stripStyle = {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '10px 16px',
      fontSize: '13px',
      lineHeight: '18px',
      color: 'var(--dsw-alias-state-warn-primary, #f59e0b)',
      background: 'var(--dsw-alias-state-warn-tertiary, rgba(245, 158, 11, 0.12))',
    }
    const dotStyle = { width: '8px', height: '8px', borderRadius: '50%', background: 'currentColor', flex: '0 0 auto' }
    const bodyStyle = { display: 'flex', flexDirection: 'column', gap: '6px', padding: '12px 16px 0' }
    const headlineStyle = {
      fontSize: '15px',
      fontWeight: 500,
      lineHeight: '24px',
      color: 'var(--dsw-alias-label-primary, #f5f5f5)',
      wordBreak: 'break-word',
    }
    const labelStyle = { marginTop: '4px', fontSize: '12px', color: 'var(--dsw-alias-label-tertiary, #9ca3af)' }
    const noteStyle = {
      width: '100%',
      boxSizing: 'border-box',
      minHeight: '56px',
      maxHeight: '160px',
      resize: 'vertical',
      padding: '8px 10px',
      borderRadius: '8px',
      border: '1px solid var(--dsw-alias-border-secondary, #3f3f46)',
      background: 'var(--dsw-specific-input-major, #141416)',
      color: 'var(--dsw-alias-label-primary, #f5f5f5)',
      font: 'inherit',
      fontSize: '13px',
      lineHeight: '20px',
    }
    const hintStyle = { fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary, #9ca3af)' }
    const errorStyle = { fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-state-error-primary, #f87171)' }
    const actionRowStyle = { display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '14px 16px', flexWrap: 'wrap' }

    // 原生按钮的兜底样式：primary 用品牌色实底，其余为描边；禁用时半透明。
    function nativeButtonStyle(emphasis, disabled) {
      const primary = emphasis === 'primary'
      return {
        appearance: 'none',
        border: primary ? '1px solid transparent' : '1px solid var(--dsw-alias-border-secondary, #3f3f46)',
        background: primary ? 'var(--dsw-alias-brand-primary, #4d6bfe)' : 'transparent',
        color: primary ? '#ffffff' : 'var(--dsw-alias-label-primary, #f5f5f5)',
        borderRadius: '8px',
        padding: '6px 12px',
        font: 'inherit',
        fontSize: '13px',
        lineHeight: '20px',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }
    }

    /**
     * One card action; `accent` is a native-button emphasis with no primitive peer.
     *
     * 中文：渲染一个按钮。有 primitives 时用 Button（outline / primary）；
     * “拒绝并说明”（accent）没有对应的 primitive 变体，固定用原生按钮。
     */
    function action(label, emphasis, disabled, onClick) {
      if (Button !== null && emphasis !== 'accent') {
        return h(Button, {
          variant: emphasis === 'primary' ? 'primary' : 'outline',
          disabled,
          onClick,
        }, label)
      }
      return h('button', {
        type: 'button',
        disabled,
        onClick,
        style: nativeButtonStyle(emphasis, disabled),
      }, label)
    }

    /**
     * Only a live, answerable approval is taken over. Anything else returns
     * null so the chain continues to the stock panel.
     *
     * 中文：只接管“还在等待回答”的审批对象。任何一项不满足（kind 不对、
     * 没有 answer 方法、已经答过）都返回 null，让链继续走到官方卡——
     * 这是本插件唯一的失败兜底路径。
     */
    function isApproval(pending) {
      return pending !== null
        && pending !== undefined
        && typeof pending === 'object'
        && pending.kind === 'approval'
        && typeof pending.answer === 'function'
        && pending.answerable === true
    }

    /**
     * 审批卡主体。
     *
     * 状态只有四个：note（输入框内容）、busy（一次只允许提交一个决定）、
     * failure（投递或作答失败时的提示）、settled（同步闸门，防止连点——
     * 因为 setState 是异步的，只靠 busy 拦不住同一帧里的第二次点击）。
     */
    function ApprovalNoteCard(props) {
      const pending = props.matched
      const t = props.t
      const fieldId = typeof React.useId === 'function' ? React.useId() : 'approval-note-field'
      const [note, setNote] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [failure, setFailure] = React.useState(null)
      const settled = React.useRef(false)

      const reason = pending.displayReason === undefined || typeof props.resolveReason !== 'function'
        ? pending.reason
        : props.resolveReason(pending.displayReason)

      const reopen = () => {
        settled.current = false
        setBusy(false)
      }

      // 直接作答（允许 / 拒绝）：先置 settled 再走异步，避免同一张卡被点两次。
      const answer = (outcome) => {
        if (settled.current || pending.answerable !== true) return
        settled.current = true
        setBusy(true)
        setFailure(null)
        Promise.resolve(pending.answer(outcome)).catch(() => {
          reopen()
          setFailure(t('failed'))
        })
      }

      // 拒绝并说明：先投递文本，成功后再拒绝。顺序不能反——若先拒绝，
      // 宿主一旦取消本轮就会清空 inbox，说明永远送不到模型手里。
      const rejectWithNote = () => {
        const text = note.trim()
        if (settled.current || pending.answerable !== true || text === '') return
        if (text.length > MAX_NOTE) {
          setFailure(t('tooLong'))
          return
        }
        settled.current = true
        setBusy(true)
        setFailure(null)
        // The note is delivered first: a rejection that never carried it is
        // worse than a rejection that arrives a step later.
        // Defensive fallback: the standard prop and the request's own scope
        // should agree; if the prop is ever absent, the request still knows.
        const target = props.sessionId !== undefined ? props.sessionId : pending.sessionId
        const send = typeof props.sendNote === 'function'
          ? props.sendNote(target, `${t('note.prefix')} ${text}`)
          : Promise.resolve({ ok: false })
        Promise.resolve(send).then((delivered) => {
          if (delivered === null || delivered === undefined || delivered.ok !== true) {
            reopen()
            setFailure(t('failed'))
            return
          }
          return Promise.resolve(pending.answer('rejected')).then(undefined, () => {
            reopen()
            setFailure(t('failed'))
          })
        }, () => {
          reopen()
          setFailure(t('failed'))
        })
      }

      // 键盘约定：Enter 发送说明，Shift+Enter 换行，输入法组词期间不触发。
      const onNoteKeyDown = (event) => {
        if (event.key !== 'Enter') return
        // The page binds Enter to "allow" while an approval is pending. A
        // keystroke typed here must never reach that binding.
        event.stopPropagation()
        if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return
        if (event.nativeEvent !== undefined && event.nativeEvent.isComposing === true) return
        event.preventDefault()
        if (note.trim() !== '') rejectWithNote()
      }

      const disabled = busy || pending.answerable !== true

      // No `conversation.approval.detail` slot on purpose: the stock entry
      // already declares that child, and the guards' displayReason carries the
      // path or command this card has to show.
      //
      // 中文：这里故意不声明 conversation.approval.detail 子槽——官方卡已经
      // 声明过，重复声明有风险；而守卫给的 displayReason 里通常已经带了路径
      // 或命令，足够判断这次调用要做什么。
      return h('div', { style: rootStyle, 'data-approval-note-card': pending.key },
        h('div', { style: cardStyle },
          h('div', { style: stripStyle },
            h('span', { style: dotStyle, 'aria-hidden': true }),
            t('waiting')
          ),
          h('div', { style: bodyStyle },
            h('div', { style: headlineStyle }, reason === undefined || reason === null || reason === '' ? t('escalation', { toolName: pending.toolName }) : reason),
            h('label', { htmlFor: fieldId, style: labelStyle }, t('note.label')),
            h('textarea', {
              id: fieldId,
              value: note,
              rows: 2,
              maxLength: MAX_NOTE,
              disabled,
              spellCheck: false,
              placeholder: t('note.placeholder'),
              onChange: (event) => { setNote(event.currentTarget.value) },
              onKeyDown: onNoteKeyDown,
              style: Object.assign({}, noteStyle, { opacity: disabled ? 0.6 : 1 }),
            }),
            h('div', { style: hintStyle }, t('note.hint')),
            failure === null ? null : h('div', { style: errorStyle, role: 'status' }, failure)
          ),
          h('div', { style: actionRowStyle },
            action(t('reject'), 'outline', disabled, () => answer('rejected')),
            action(t('note.submit'), 'accent', disabled || note.trim() === '', rejectWithNote),
            action(t('allowOnce'), 'primary', disabled, () => answer('allowed-once'))
          )
        )
      )
    }

    // 客户端插件入口，只依赖三个服务：
    //   slots    —— 往 composer 链上注册条目
    //   sessions —— 取当前会话对象，用来投递说明
    //   locale   —— 注册中英词典、按界面语言取文案
    return {
      inject: ['slots', 'sessions', 'locale'],
      apply(ctx) {
        // 注册中英词典；插件卸载时由 ctx.effect 负责清理。
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'approval-note-card: dictionaries')
        // 挂到 composer 链上：每次渲染时由 select 决定是否接管。
        ctx.slots.inject('conversation.composer', () => ctx.slots.register({
          name: 'conversation.composer',
          // Ascending order: below the stock panel (1) and the question
          // composer (-10), which only matches its own interactions.
          // 中文：链按 priority 升序取第一个非 null。官方卡是 1，问题 composer
          // 是 -10（只匹配它自己的交互），这里取 -1：抢在官方卡之前，又不
          // 越位去抢问题 composer 的位置。
          priority: -1,
          select: ({ pendingInteraction }) => isApproval(pendingInteraction) ? pendingInteraction : null,
          locale: NS,
          // 把 ctx 的能力以 props 形式交给组件（组件里只有 props，没有 ctx）。
          inject: () => ({
            resolveReason: (value) => ctx.locale.resolveText(value),
            sendNote: async (sessionId, text) => {
              if (sessionId === undefined || sessionId === null) return { ok: false }
              const binding = ctx.sessions.binding(sessionId)
              if (binding === undefined) return { ok: false }
              // `steer` puts the note into the running turn's next step. `queue`
              // would wait for a turn that may never open after a rejection.
              // 中文：steer 插进当前轮的下一步；queue 要等下一轮，而拒绝之后
              // 这一轮可能根本不会自然结束，所以必须用 steer。
              const result = await binding.session.prompt([{ type: 'text', text }], 'steer')
              return { ok: result !== undefined && result !== null && result.ok === true }
            },
          }),
        }, ApprovalNoteCard))
      },
    }
  },
})
