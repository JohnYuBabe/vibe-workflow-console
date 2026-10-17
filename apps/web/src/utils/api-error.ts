import axios from 'axios';

/**
 * 从 Axios 错误里取出后端的中文提示。
 * NestJS 的 ValidationPipe 可能返回 string[]，统一用分号拼接。
 */
export function readApiError(
  value: unknown,
  fallback = '操作失败，请稍后重试。',
): string {
  if (axios.isAxiosError(value)) {
    const body = value.response?.data as
      | { message?: string | string[]; reasons?: string[] }
      | undefined;

    // 流转失败会带 reasons（门禁的具体原因），优先展示它们
    if (Array.isArray(body?.reasons) && body.reasons.length > 0) {
      if (
        typeof body.message === 'string' &&
        body.message &&
        body.message !== body.reasons[0]
      ) {
        return `${body.message}：${body.reasons.join('；')}`;
      }
      return body.reasons.join('；');
    }

    if (Array.isArray(body?.message)) {
      return body.message.join('；');
    }
    if (typeof body?.message === 'string' && body.message) {
      return body.message;
    }
    if (value.code === 'ECONNABORTED') {
      return '请求超时，请稍后重试。';
    }
    if (!value.response) {
      return '无法连接服务端，请确认 API 已启动。';
    }
  }

  if (value instanceof Error && value.message) {
    return value.message;
  }

  return fallback;
}
