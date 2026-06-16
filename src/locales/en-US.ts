import type { Dict } from 'koishi'

export const enUS: Dict = {
  commands: {
    milthm: {
      description: 'Milthm Profiler',
      messages: {
        'no-binding': 'Milthm account not linked. Please use milthm.update to authorize and link first.',
        'no-cache': 'No local cache found. Please use milthm.update to fetch data first.',
        'query-failed': 'Query failed: {error}',
        'cached-result': 'Rating: {rating}\nData time: {date} (use milthm.update to fetch latest data)',
      },
    },
    'milthm.update': {
      description: 'Fetch latest data (consumes daily download quota)',
      messages: {
        'auth-expired': 'Authorization expired. Please open the following link in your browser to re-authorize (valid for 5 minutes):',
        'auth-link-text': 'Click here to authorize',
        'query-failed': 'Query failed: {message}',
        'pull-failed': 'Pull failed: {message}',
        'bind-success-but-pull-failed': 'Binding successful ({username}), but failed to pull data: {message}',
        'auth-prompt': 'Please open the following link in your browser to complete authorization (valid for 5 minutes):\nUser: {target}',
        'pull-failed-error': 'Failed to pull data: {error}',
        'result-summary': 'Rating: {rating}\nData time: {date}',
        'no-valid-scores': 'No valid score data found',
        'error-api-not-init': 'API client not initialized',
        'error-session-not-init': 'Session manager not initialized',
        'error-session-not-found': 'Authorization session not found',
        'error-no-binding': 'No binding record found. Please use milthm.update to authorize and link first.',
        'error-plugin-not-init': 'Plugin not initialized',
        'error-auth-rejected': 'User rejected the authorization request',
        'error-auth-timeout': 'Authorization timed out',
        'error-daily-limit': 'Daily download limit reached. Please try again tomorrow.',
        'error-gen-auth-failed': 'Failed to generate authorization URL: {detail}',
        'error-poll-failed': 'Failed to poll authorization status: {detail}',
        'error-query-failed-detail': 'Failed to query user data: {detail}',
        'error-gen-auth-parse-failed': 'Failed to parse authorization response. Enable debug logging for details.',
        'error-poll-parse-failed': 'Failed to parse polling response. Enable debug logging for details.',
        'error-query-parse-failed': 'Failed to parse query response. Enable debug logging for details.',
      },
    },
    'milthm.cancel': {
      description: 'Cancel the current authorization request',
      messages: {
        cancelled: 'Authorization request cancelled.',
        none: 'No active authorization request.',
      },
    },
    'milthm.logout': {
      description: 'Log out and clear local binding data',
      messages: {
        'no-binding': 'No linked account found.',
        success: 'Successfully logged out. Binding data cleared. To use again, re-authorize via milthm.update.',
        failed: 'Logout failed: {error}',
      },
    },
  },
}
