/**
 * 任务状态机与门禁策略。
 *
 * 纯函数实现，不依赖 Nest / Prisma，后端 API 与前端表单共用同一份判断，
 * 保证「门禁不可绕过」在前端展示与后端拦截上口径一致。
 */

export const TASK_STATUSES = [
  'draft',
  'ready',
  'in_progress',
  'review',
  'done',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

/** 状态中文名，错误文案与 UI 共用 */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  draft: '草稿',
  ready: '待开发',
  in_progress: '进行中',
  review: '待审查',
  done: '已完成',
};

/**
 * 允许的流转方向，数组顺序即 UI 中展示候选操作按钮的顺序。
 * 先列前进方向，再列回退方向；done 无出边。
 */
export const TASK_STATUS_FLOW: Record<TaskStatus, readonly TaskStatus[]> = {
  draft: ['ready'],
  ready: ['in_progress', 'draft'],
  in_progress: ['review', 'ready'],
  review: ['done', 'in_progress'],
  done: [],
};

/** 规格去空白后的最小字数 */
export const SPEC_MIN_LENGTH = 20;
/** 非空验收标准的最少条数 */
export const ACCEPTANCE_MIN_COUNT = 3;
/** 人工追溯记录去空白后的最小字数 */
export const MANUAL_NOTE_MIN_LENGTH = 20;

export interface TaskGateInput {
  /** 任务规格，可为空 */
  spec: string | null;
  /** 验收标准内容列表，空白项不计入 */
  acceptanceCriteria: string[];
  /** 通过的验证条数（Day 3 起由 Verification 中 result='passed' 的记录统计） */
  passedVerifications: number;
  /** AI 会话条数（Day 3 起由任务关联的 AiSession 统计） */
  aiSessionCount: number;
  /** 人工追溯记录，可为空 */
  manualNote: string | null;
}

export type TransitionErrorCode =
  | 'INVALID_TRANSITION'
  | 'SPEC_GATE'
  | 'VERIFICATION_GATE'
  | 'TRACEABILITY_GATE';

export interface TransitionEvaluation {
  allowed: boolean;
  /** 第一条失败门禁的错误码；仅 allowed 为 false 时存在 */
  code?: TransitionErrorCode;
  /** 全部失败原因，按门禁顺序排列 */
  reasons: string[];
}

export interface AvailableTransition {
  to: TaskStatus;
  allowed: boolean;
  reasons: string[];
}

function labelOf(status: TaskStatus): string {
  return TASK_STATUS_LABELS[status] ?? status;
}

/** 规格门禁摘要，供详情接口展示当前字数/条数与达标状态 */
export interface SpecGateSummary {
  specLength: number;
  criteriaCount: number;
  specOk: boolean;
  criteriaOk: boolean;
}

/**
 * 计算规格与验收标准的当前状态。
 * evaluateSpecGate 与接口返回的 gate 摘要都从这里取值，
 * 避免后端另写一份计数口径导致展示与拦截不一致。
 */
export function summarizeSpecGate(input: TaskGateInput): SpecGateSummary {
  const specLength = (input.spec ?? '').trim().length;
  const criteriaCount = input.acceptanceCriteria.filter(
    (item) => item.trim().length > 0,
  ).length;

  return {
    specLength,
    criteriaCount,
    specOk: specLength >= SPEC_MIN_LENGTH,
    criteriaOk: criteriaCount >= ACCEPTANCE_MIN_COUNT,
  };
}

/** 规格门禁：draft->ready 与 ready->in_progress */
function evaluateSpecGate(input: TaskGateInput): string[] {
  const reasons: string[] = [];
  const { specLength, criteriaCount } = summarizeSpecGate(input);

  if (specLength < SPEC_MIN_LENGTH) {
    reasons.push(`规格至少 ${SPEC_MIN_LENGTH} 字，当前 ${specLength} 字`);
  }

  if (criteriaCount < ACCEPTANCE_MIN_COUNT) {
    reasons.push(
      `至少需要 ${ACCEPTANCE_MIN_COUNT} 条验收标准，当前 ${criteriaCount} 条`,
    );
  }

  return reasons;
}

/** 完成门禁摘要，供详情接口展示验证/追溯状态 */
export interface CompletionGateSummary {
  /** 通过的验证条数 */
  passedVerifications: number;
  /** 是否至少有 1 条通过的验证 */
  verificationOk: boolean;
  /** AI 会话条数 */
  aiSessionCount: number;
  /** 人工记录去空白后的字数 */
  manualNoteLength: number;
  /** 是否满足追溯要求：至少 1 条 AI 会话，或人工记录不少于 20 字 */
  traceabilityOk: boolean;
}

/**
 * 计算完成门禁（验证 + 追溯）的当前状态。
 * evaluateVerificationGate 与 evaluateTraceabilityGate 都从这里派生，
 * 详情接口的 gate 摘要也取同一份结果，保证门禁逻辑只有一份。
 */
export function summarizeCompletionGate(
  input: TaskGateInput,
): CompletionGateSummary {
  const passedVerifications = input.passedVerifications;
  const aiSessionCount = input.aiSessionCount;
  const manualNoteLength = (input.manualNote ?? '').trim().length;

  return {
    passedVerifications,
    verificationOk: passedVerifications >= 1,
    aiSessionCount,
    manualNoteLength,
    traceabilityOk:
      aiSessionCount >= 1 || manualNoteLength >= MANUAL_NOTE_MIN_LENGTH,
  };
}

/** 验证门禁：review->done 至少 1 条通过的验证 */
function evaluateVerificationGate(input: TaskGateInput): string[] {
  if (summarizeCompletionGate(input).verificationOk) {
    return [];
  }
  return ['没有通过的验证记录，不能标记完成'];
}

/** 追溯门禁：review->done 至少 1 条 AI 会话，或不少于 20 字的人工记录 */
function evaluateTraceabilityGate(input: TaskGateInput): string[] {
  if (summarizeCompletionGate(input).traceabilityOk) {
    return [];
  }

  return [
    `缺少追溯记录：至少一条 AI 会话，或不少于 ${MANUAL_NOTE_MIN_LENGTH} 字的人工记录`,
  ];
}

function isValidTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_STATUS_FLOW[from]?.includes(to) ?? false;
}

/**
 * 判断一次流转是否允许，并给出全部失败原因。
 * 非法流转直接返回 INVALID_TRANSITION；合法流转再依次检查对应门禁，
 * code 取第一条失败的门禁。
 */
export function evaluateTransition(
  input: TaskGateInput,
  from: TaskStatus,
  to: TaskStatus,
): TransitionEvaluation {
  if (!isValidTransition(from, to)) {
    return {
      allowed: false,
      code: 'INVALID_TRANSITION',
      reasons: [
        `不允许从「${labelOf(from)}」直接流转到「${labelOf(to)}」`,
      ],
    };
  }

  let code: TransitionErrorCode | undefined;
  const reasons: string[] = [];

  // 规格门禁只作用于 draft -> ready 与 ready -> in_progress 两条前进边；
  // in_progress -> ready 是回退，不检查规格（允许规格被改短后回退）。
  if (
    (from === 'draft' && to === 'ready') ||
    (from === 'ready' && to === 'in_progress')
  ) {
    const specReasons = evaluateSpecGate(input);
    if (specReasons.length > 0) {
      code = code ?? 'SPEC_GATE';
      reasons.push(...specReasons);
    }
  }

  // 完成门禁同时检查验证与追溯
  if (from === 'review' && to === 'done') {
    const verificationReasons = evaluateVerificationGate(input);
    if (verificationReasons.length > 0) {
      code = code ?? 'VERIFICATION_GATE';
      reasons.push(...verificationReasons);
    }

    const traceabilityReasons = evaluateTraceabilityGate(input);
    if (traceabilityReasons.length > 0) {
      code = code ?? 'TRACEABILITY_GATE';
      reasons.push(...traceabilityReasons);
    }
  }

  return {
    allowed: reasons.length === 0,
    ...(code ? { code } : {}),
    reasons,
  };
}

/** 按 TASK_STATUS_FLOW 顺序列出当前状态的所有候选流转及判断结果 */
export function availableTransitions(
  input: TaskGateInput,
  from: TaskStatus,
): AvailableTransition[] {
  return TASK_STATUS_FLOW[from].map((to) => {
    const evaluation = evaluateTransition(input, from, to);
    return {
      to,
      allowed: evaluation.allowed,
      reasons: evaluation.reasons,
    };
  });
}
