/**
 * Agent-native error codes for Outpost API.
 * These are parseable by LLMs — use them in switch statements, not string matching.
 */
export enum OutpostErrorCode {
  AUTH_EXPIRED = 'AUTH_EXPIRED',
  AUTH_INVALID = 'AUTH_INVALID',
  RATE_LIMITED = 'RATE_LIMITED',
  ORG_QUOTA_EXCEEDED = 'ORG_QUOTA_EXCEEDED',
  CONTENT_TOO_LONG = 'CONTENT_TOO_LONG',
  CONTENT_POLICY = 'CONTENT_POLICY',
  MEDIA_TOO_LARGE = 'MEDIA_TOO_LARGE',
  MEDIA_TYPE_UNSUPPORTED = 'MEDIA_TYPE_UNSUPPORTED',
  ACCOUNT_NOT_FOUND = 'ACCOUNT_NOT_FOUND',
  PLATFORM_ERROR = 'PLATFORM_ERROR',
  PLATFORM_DOWN = 'PLATFORM_DOWN',
  SUBREDDIT_REQUIRED = 'SUBREDDIT_REQUIRED',
  SUBREDDIT_NOT_FOUND = 'SUBREDDIT_NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  TIER_INSUFFICIENT = 'TIER_INSUFFICIENT',
  PLATFORM_QUOTA_EXCEEDED = 'PLATFORM_QUOTA_EXCEEDED',
}

export interface AgentError {
  code: OutpostErrorCode;
  message: string;
  /** LLM-readable hint: what the agent should do next */
  agentHint: string;
  /** ISO-8601 timestamp — when to retry (if applicable) */
  retryAfter?: string;
  /** Raw platform error string (if available) */
  platformError?: string;
  /** Max content length for CONTENT_TOO_LONG */
  maxLength?: number;
}

/**
 * Classify a raw provider error string into a OutpostErrorCode.
 * Returns best-effort classification — falls back to PLATFORM_ERROR.
 */
export function classifyError(errMsg: string): OutpostErrorCode {
  const lower = errMsg.toLowerCase();

  if (
    lower.includes('rate limit') ||
    lower.includes('rate_limit') ||
    lower.includes('too many requests') ||
    lower.includes('429')
  ) {
    return OutpostErrorCode.RATE_LIMITED;
  }

  if (
    lower.includes('401') ||
    lower.includes('unauthorized') ||
    lower.includes('token expired') ||
    lower.includes('invalid token') ||
    lower.includes('auth expired') ||
    lower.includes('invalid_token')
  ) {
    return OutpostErrorCode.AUTH_EXPIRED;
  }

  if (
    lower.includes('forbidden') ||
    lower.includes('403') ||
    lower.includes('auth invalid') ||
    lower.includes('invalid_grant')
  ) {
    return OutpostErrorCode.AUTH_INVALID;
  }

  if (
    lower.includes('too long') ||
    lower.includes('character limit') ||
    lower.includes('max length') ||
    lower.includes('exceeds') ||
    lower.includes('280')
  ) {
    return OutpostErrorCode.CONTENT_TOO_LONG;
  }

  if (
    lower.includes('policy') ||
    lower.includes('violation') ||
    lower.includes('spam') ||
    lower.includes('banned')
  ) {
    return OutpostErrorCode.CONTENT_POLICY;
  }

  if (
    lower.includes('subreddit') &&
    lower.includes('not found')
  ) {
    return OutpostErrorCode.SUBREDDIT_NOT_FOUND;
  }

  if (lower.includes('subreddit required')) {
    return OutpostErrorCode.SUBREDDIT_REQUIRED;
  }

  if (
    lower.includes('media too large') ||
    lower.includes('file too large') ||
    lower.includes('413')
  ) {
    return OutpostErrorCode.MEDIA_TOO_LARGE;
  }

  if (
    lower.includes('service unavailable') ||
    lower.includes('503') ||
    lower.includes('down') ||
    lower.includes('maintenance')
  ) {
    return OutpostErrorCode.PLATFORM_DOWN;
  }

  return OutpostErrorCode.PLATFORM_ERROR;
}

/**
 * Build an agent-native error response from a raw error + optional context.
 */
export function buildAgentError(
  err: unknown,
  platform: string,
): AgentError {
  const errMsg = err instanceof Error ? err.message : String(err);
  const code = classifyError(errMsg);

  const hints: Record<OutpostErrorCode, string> = {
    [OutpostErrorCode.AUTH_EXPIRED]: `Token expired for ${platform}. Call POST /api/v1/accounts/connect/${platform} to re-authenticate.`,
    [OutpostErrorCode.AUTH_INVALID]: `Token is invalid or revoked for ${platform}. The user must reconnect their account via POST /api/v1/accounts/connect/${platform}.`,
    [OutpostErrorCode.RATE_LIMITED]: `Rate limit hit for ${platform}. Wait until retryAfter before posting again.`,
    [OutpostErrorCode.ORG_QUOTA_EXCEEDED]: `Monthly post quota exceeded. Upgrade plan or wait until next month.`,
    [OutpostErrorCode.CONTENT_TOO_LONG]: `Content exceeds ${platform}'s character limit. Shorten the text and retry.`,
    [OutpostErrorCode.CONTENT_POLICY]: `${platform} rejected content due to policy violation. Review content and retry with different wording.`,
    [OutpostErrorCode.MEDIA_TOO_LARGE]: `Media file exceeds ${platform}'s size limit. Compress or resize the file and retry.`,
    [OutpostErrorCode.MEDIA_TYPE_UNSUPPORTED]: `${platform} does not support this media type. Check GET /api/v1/platforms/${platform}/capabilities for supported types.`,
    [OutpostErrorCode.ACCOUNT_NOT_FOUND]: `Account not found. Check GET /api/v1/accounts to list connected accounts.`,
    [OutpostErrorCode.PLATFORM_ERROR]: `${platform} returned an error. Check platform status and retry.`,
    [OutpostErrorCode.PLATFORM_DOWN]: `${platform} appears to be down or in maintenance. Retry after a few minutes.`,
    [OutpostErrorCode.SUBREDDIT_REQUIRED]: `Reddit posts require a subreddit. Include metadata.subreddit in the request.`,
    [OutpostErrorCode.SUBREDDIT_NOT_FOUND]: `The subreddit does not exist or is private. Verify the subreddit name.`,
    [OutpostErrorCode.VALIDATION_ERROR]: `Request validation failed. Check the request body and retry.`,
    [OutpostErrorCode.TIER_INSUFFICIENT]: `Your current plan does not include this feature. Upgrade to access it.`,
    [OutpostErrorCode.PLATFORM_QUOTA_EXCEEDED]: `Your plan allows a limited number of connected platforms. Disconnect one or upgrade your plan.`,
  };

  return {
    code,
    message: errMsg,
    agentHint: hints[code] ?? `An error occurred on ${platform}. Check the platformError field for details.`,
    platformError: errMsg,
  };
}
