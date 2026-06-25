import type { Dict } from 'koishi';

export const enUS: Dict = {
  errors: {
    'api-client-not-init': 'API client not initialized',
    'session-manager-not-init': 'Session manager not initialized',
    'plugin-not-init': 'Plugin not initialized',
    'auth-gen-http-failed': 'Failed to generate authorization URL: {detail}',
    'auth-gen-parse-failed':
      'Failed to parse authorization response. Enable debug logging for details.',
    'auth-gen-failed': 'Failed to generate authorization URL: {detail}',
    'auth-poll-http-failed': 'Failed to poll authorization status: {detail}',
    'auth-poll-parse-failed': 'Failed to parse polling response. Enable debug logging for details.',
    'auth-rejected': 'User rejected the authorization request',
    'auth-timeout': 'Authorization timed out',
    'auth-session-not-found': 'Authorization session not found',
    'binding-not-found':
      'No binding record found. Please use milthm.update to authorize and link first.',
    'query-parse-failed': 'Failed to parse query response. Enable debug logging for details.',
    'query-daily-limit': 'Daily download limit reached. Please try again tomorrow.',
    'query-failed': 'Failed to query user data: {detail}',
    unknown: 'Unknown error: {detail}'
  },
  commands: {
    milthm: {
      description: 'Milthm Profiler',
      messages: {
        'no-binding':
          'Milthm account not linked. Please use milthm.update to authorize and link first.',
        'no-cache': 'No local cache found. Please use milthm.update to fetch data first.',
        'query-failed': 'Query failed: {error}',
        'result-summary': 'Rating: {rating}\nData time: {date}'
      }
    },
    'milthm.get': {
      description: 'Query cached data',
      messages: {
        'no-binding':
          'Milthm account not linked. Please use milthm.update to authorize and link first.',
        'no-cache': 'No local cache found. Please use milthm.update to fetch data first.',
        'query-failed': 'Query failed: {error}',
        'result-summary': 'Rating: {rating}\nData time: {date}'
      }
    },
    'milthm.update': {
      description: 'Fetch latest data (consumes daily download quota)',
      messages: {
        'auth-expired':
          'Authorization expired. Please open the following link in your browser to re-authorize (valid for 5 minutes):',
        'auth-link-text': 'Click here to authorize',
        'query-failed': 'Query failed: {message}',
        'pull-failed': 'Pull failed: {message}',
        'bind-success-but-pull-failed':
          'Binding successful ({username}), but failed to pull data: {message}',
        'auth-prompt':
          'Please open the following link in your browser to complete authorization for {target} (valid for 5 minutes):',
        'pull-failed-error': 'Failed to pull data: {error}',
        'result-summary': 'Rating: {rating}\nData time: {date}',
        'no-valid-scores': 'No valid score data found'
      }
    },
    'milthm.cancel': {
      description: 'Cancel the current authorization request',
      messages: {
        cancelled: 'Authorization request cancelled.',
        none: 'No active authorization request.'
      }
    },
    'milthm.logout': {
      description: 'Log out and clear local binding data',
      messages: {
        'no-binding': 'No linked account found.',
        success:
          'Successfully logged out. Binding data cleared. To use again, re-authorize via milthm.update.',
        failed: 'Logout failed: {error}'
      }
    }
  }
};
