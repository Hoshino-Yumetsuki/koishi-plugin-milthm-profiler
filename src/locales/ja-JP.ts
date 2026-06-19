import type { Dict } from 'koishi'

export const jaJP: Dict = {
  errors: {
    'api-client-not-init': 'API クライアントが初期化されていません',
    'session-manager-not-init': 'セッションマネージャーが初期化されていません',
    'plugin-not-init': 'プラグインが初期化されていません',
    'auth-gen-http-failed': '認証リンクの生成に失敗しました: {detail}',
    'auth-gen-parse-failed': '認証リンク生成レスポンスの解析に失敗しました。デバッグログを有効にしてください。',
    'auth-gen-failed': '認証リンクの生成に失敗しました: {detail}',
    'auth-poll-http-failed': '認証状態のポーリングに失敗しました: {detail}',
    'auth-poll-parse-failed': 'ポーリングレスポンスの解析に失敗しました。デバッグログを有効にしてください。',
    'auth-rejected': 'ユーザーが認証リクエストを拒否しました',
    'auth-timeout': '認証がタイムアウトしました',
    'auth-session-not-found': '認証セッションが見つかりません',
    'binding-not-found': '連携記録が見つかりません。先に milthm.update で認証連携してください。',
    'query-parse-failed': 'クエリレスポンスの解析に失敗しました。デバッグログを有効にしてください。',
    'query-daily-limit': '本日のダウンロード回数が上限に達しました。明日もう一度お試しください。',
    'query-failed': 'ユーザーデータのクエリに失敗しました: {detail}',
    'unknown': '不明なエラー: {detail}',
  },
  commands: {
    milthm: {
      description: 'Milthm プロファイラー',
      messages: {
        'no-binding': 'Milthm アカウントが紐付けられていません。先に milthm.update で認証連携してください。',
        'no-cache': 'ローカルキャッシュが見つかりません。先に milthm.update でデータを取得してください。',
        'query-failed': 'クエリ失敗: {error}',
        'result-summary': 'Rating: {rating}\nデータ時刻: {date}',
      },
    },
    'milthm.get': {
      description: 'キャッシュデータをクエリ',
      messages: {},
    },
    'milthm.update': {
      description: '最新データを取得（毎日のダウンロード回数を消費します）',
      messages: {
        'auth-expired': '認証の有効期限が切れました。ブラウザで以下のリンクを開いて再認証してください（5分間有効）：',
        'auth-link-text': 'ここをクリックして認証',
        'query-failed': 'クエリ失敗: {message}',
        'pull-failed': '取得失敗: {message}',
        'bind-success-but-pull-failed': '連携成功（{username}）しましたが、データ取得に失敗しました: {message}',
        'auth-prompt': 'ブラウザで以下のリンクを開いて {target} の認証連携を完了してください（5分間有効）：',
        'pull-failed-error': 'データ取得に失敗しました: {error}',
        'result-summary': 'Rating: {rating}\nデータ時刻: {date}',
        'no-valid-scores': '有効なスコアデータが見つかりません',
      },
    },
    'milthm.cancel': {
      description: '現在の認証リクエストをキャンセル',
      messages: {
        cancelled: '認証リクエストをキャンセルしました。',
        none: '進行中の認証リクエストはありません。',
      },
    },
    'milthm.logout': {
      description: 'ログアウトしてローカルの連携データを削除',
      messages: {
        'no-binding': '紐付けられたアカウントはありません。',
        success: 'ログアウトしました。連携データを削除しました。再使用するには milthm.update で再認証してください。',
        failed: 'ログアウト失敗: {error}',
      },
    },
  },
}
