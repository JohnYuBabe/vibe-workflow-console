import {
  availableTransitions,
  evaluateTransition,
  summarizeCompletionGate,
  type TaskGateInput,
} from '@vibe/shared';

/** 规格与验收标准都不满足门禁的输入 */
const insufficient: TaskGateInput = {
  spec: '短',
  acceptanceCriteria: [],
  passedVerifications: 0,
  aiSessionCount: 0,
  manualNote: null,
};

/** 完成门禁用例的基础输入：规格已满足，只看验证与追溯 */
const completionBase: TaskGateInput = {
  spec: '规格已满足，用于单独验证完成门禁的验证与追溯条件。',
  acceptanceCriteria: ['验收一', '验收二', '验收三'],
  passedVerifications: 0,
  aiSessionCount: 0,
  manualNote: null,
};

/** 恰好 20 字的人工记录 */
const NOTE_20 = '一二三四五六七八九十一二三四五六七八九十';

describe('@vibe/shared 规格门禁作用范围', () => {
  const cases: Array<{
    name: string;
    from: 'draft' | 'ready' | 'in_progress';
    to: 'ready' | 'in_progress';
    allowed: boolean;
  }> = [
    { name: 'draft -> ready 检查规格', from: 'draft', to: 'ready', allowed: false },
    {
      name: 'ready -> in_progress 检查规格',
      from: 'ready',
      to: 'in_progress',
      allowed: false,
    },
    {
      name: 'in_progress -> ready 回退不检查规格',
      from: 'in_progress',
      to: 'ready',
      allowed: true,
    },
  ];

  it.each(cases)('$name', ({ from, to, allowed }) => {
    const result = evaluateTransition(insufficient, from, to);

    expect(result.allowed).toBe(allowed);
    if (!allowed) {
      expect(result.code).toBe('SPEC_GATE');
    }
  });

  it('in_progress 的可用流转中 ready 回退为 allowed', () => {
    const transitions = availableTransitions(insufficient, 'in_progress');
    const toReady = transitions.find((item) => item.to === 'ready');

    expect(toReady).toEqual({ to: 'ready', allowed: true, reasons: [] });
  });
});

describe('@vibe/shared 完成门禁（review -> done）', () => {
  const cases: Array<{
    name: string;
    input: Partial<TaskGateInput>;
    allowed: boolean;
    code?: 'VERIFICATION_GATE' | 'TRACEABILITY_GATE';
    reasonCount: number;
  }> = [
    {
      name: '缺验证且缺追溯：两条原因都列出，code 取第一条',
      input: {},
      allowed: false,
      code: 'VERIFICATION_GATE',
      reasonCount: 2,
    },
    {
      name: '缺验证：AI 会话已满足追溯，仍被验证门禁拦下',
      input: { aiSessionCount: 1 },
      allowed: false,
      code: 'VERIFICATION_GATE',
      reasonCount: 1,
    },
    {
      name: '缺追溯：验证已通过但无 AI 会话与人工记录',
      input: { passedVerifications: 1 },
      allowed: false,
      code: 'TRACEABILITY_GATE',
      reasonCount: 1,
    },
    {
      name: '缺追溯：人工记录不足 20 字',
      input: { passedVerifications: 1, manualNote: '太短' },
      allowed: false,
      code: 'TRACEABILITY_GATE',
      reasonCount: 1,
    },
    {
      name: '验证通过且有 1 条 AI 会话：允许完成',
      input: { passedVerifications: 1, aiSessionCount: 1 },
      allowed: true,
      reasonCount: 0,
    },
    {
      name: '验证通过且人工记录恰好 20 字：允许完成',
      input: { passedVerifications: 1, manualNote: NOTE_20 },
      allowed: true,
      reasonCount: 0,
    },
    {
      name: '只有 failed 验证（passedVerifications=0）时仍被拦',
      input: { passedVerifications: 0, aiSessionCount: 1 },
      allowed: false,
      code: 'VERIFICATION_GATE',
      reasonCount: 1,
    },
  ];

  it.each(cases)('$name', ({ input, allowed, code, reasonCount }) => {
    const result = evaluateTransition(
      { ...completionBase, ...input },
      'review',
      'done',
    );

    expect(result.allowed).toBe(allowed);
    expect(result.reasons).toHaveLength(reasonCount);
    if (code) {
      expect(result.code).toBe(code);
    } else {
      expect(result.code).toBeUndefined();
    }
  });

  it('两者同时缺时 reasons 同时包含验证与追溯原因', () => {
    const result = evaluateTransition(completionBase, 'review', 'done');

    expect(result.code).toBe('VERIFICATION_GATE');
    expect(result.reasons[0]).toContain('没有通过的验证记录');
    expect(result.reasons[1]).toContain('缺少追溯记录');
  });

  it('availableTransitions(review) 的 done 与 evaluateTransition 口径一致', () => {
    const blocked = availableTransitions(completionBase, 'review');
    expect(blocked.find((item) => item.to === 'done')).toEqual({
      to: 'done',
      allowed: false,
      reasons: [
        '没有通过的验证记录，不能标记完成',
        '缺少追溯记录：至少一条 AI 会话，或不少于 20 字的人工记录',
      ],
    });

    const ready = availableTransitions(
      { ...completionBase, passedVerifications: 1, aiSessionCount: 1 },
      'review',
    );
    expect(ready.find((item) => item.to === 'done')).toEqual({
      to: 'done',
      allowed: true,
      reasons: [],
    });
  });
});

describe('@vibe/shared summarizeCompletionGate', () => {
  it('统计通过验证数、AI 会话数与去空白后的人工记录字数', () => {
    const summary = summarizeCompletionGate({
      ...completionBase,
      passedVerifications: 2,
      aiSessionCount: 1,
      manualNote: '  短  ',
    });

    expect(summary).toEqual({
      passedVerifications: 2,
      verificationOk: true,
      aiSessionCount: 1,
      manualNoteLength: 1,
      traceabilityOk: true,
    });
  });

  it('人工记录为空或全空白时按 0 字处理，追溯不满足', () => {
    const summary = summarizeCompletionGate({
      ...completionBase,
      manualNote: '   ',
    });

    expect(summary.manualNoteLength).toBe(0);
    expect(summary.traceabilityOk).toBe(false);
    expect(summary.verificationOk).toBe(false);
  });
});
