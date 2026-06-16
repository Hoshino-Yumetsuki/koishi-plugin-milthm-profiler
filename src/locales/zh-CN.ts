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
        'error-api-not-init': 'API 客户端未初始化',
        'error-session-not-init': '会话管理器未初始化',
        'error-session-not-found': '找不到用户的授权会话',
        'error-no-binding': '未找到绑定记录，请先使用 milthm.update 命令授权绑定',
        'error-plugin-not-init': '插件未初始化',
        'error-auth-rejected': '用户拒绝了授权请求',
        'error-auth-timeout': '授权超时，用户未在规定时间内完成授权',
        'error-daily-limit': '今日存档下载次数已达上限，请明天再试',
        'error-gen-auth-failed': '生成授权链接失败: {detail}',
        'error-poll-failed': '轮询授权状态失败: {detail}',
        'error-query-failed-detail': '查询用户数据失败: {detail}',
        'error-gen-auth-parse-failed': '生成授权链接响应解析失败，请开启 debug 日志查看详情',
        'error-poll-parse-failed': '轮询授权状态响应解析失败，请开启 debug 日志查看详情',
        'error-query-parse-failed': '查询用户数据响应解析失败，请开启 debug 日志查看详情',
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
