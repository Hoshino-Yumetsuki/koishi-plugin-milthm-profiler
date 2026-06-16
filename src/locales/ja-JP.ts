import type { Dict } from 'koishi'

export const jaJP: Dict = {
  commands: {
    milthm: {
      description: 'Milthm プロファイラー',
      messages: {
        'no-binding': 'Milthm アカウントが紐付けられていません。先に milthm.update で認証連携してください。',
        'no-cache': 'ローカルキャッシュが見つかりません。先に milthm.update でデータを取得してください。',
        'query-failed': 'クエリ失敗: {error}',
        'cached-result': 'Rating: {rating}\nデータ時刻: {date}（milthm.update で最新データを取得できます）',
      },
    },
    'milthm.update': {
      description: '最新データを取得（毎日のダウンロード回数を消費します）',
      messages: {
        'auth-expired': '認証の有効期限が切れました。ブラウザで以下のリンクを開いて再認証してください（5分間有効）：',
        'auth-link-text': 'ここをクリックして認証',
        'query-failed': 'クエリ失敗: {message}',
        'pull-failed': '取得失敗: {message}',
        'bind-success-but-pull-failed': '連携成功（{username}）しましたが、データ取得に失敗しました: {message}',
        'auth-prompt': 'ブラウザで以下のリンクを開いて認証連携を完了してください（5分間有効）：\nユーザー: {target}',
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
