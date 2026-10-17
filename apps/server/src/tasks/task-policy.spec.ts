import {
  availableTransitions,
  evaluateTransition,
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
