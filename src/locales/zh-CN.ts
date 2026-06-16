import type { Dict } from 'koishi'

export const zhCN: Dict = {
  commands: {
    milthm: {
      description: 'Milthm 查分器',
      messages: {
        'no-binding': '未绑定 Milthm 账号，请先使用 milthm.update 命令进行授权绑定',
        'no-cache': '未找到本地缓存数据，请先使用 milthm.update 拉取数据',
        'query-failed': '查分失败: {error}',
        'cached-result': 'Rating: {rating}\n数据时间：{date}（使用 milthm.update 可拉取最新数据）',
      },
    },
    'milthm.update': {
      description: '拉取最新数据（消耗每日下载次数）',
      messages: {
        'auth-expired': '授权已过期，请在浏览器中打开以下链接重新授权（5分钟内有效）：',
        'auth-link-text': '点击此处完成授权',
        'query-failed': '查询失败: {message}',
        'pull-failed': '拉取失败: {message}',
        'bind-success-but-pull-failed': '绑定成功（{username}），但拉取数据失败: {message}',
        'auth-prompt': '请在浏览器中打开以下链接完成授权绑定（5分钟内有效）：\n用户: {target}',
        'pull-failed-error': '拉取数据失败: {error}',
        'result-summary': 'Rating: {rating}\n数据时间：{date}',
        'no-valid-scores': '未找到有效的成绩数据',
      },
    },
    'milthm.cancel': {
      description: '取消当前的授权请求',
      messages: {
        cancelled: '已取消授权请求',
        none: '当前没有进行中的授权请求',
      },
    },
    'milthm.logout': {
      description: '登出并清除本地绑定数据',
      messages: {
        'no-binding': '当前没有已绑定的账号',
        success: '已成功登出，绑定数据已清除。如需重新使用，请通过 milthm.update 重新授权。',
        failed: '登出失败: {error}',
      },
    },
  },
}
