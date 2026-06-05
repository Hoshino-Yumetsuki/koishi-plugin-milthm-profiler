import { Schema } from 'koishi'

export interface Config {
  nyaProfiler: {
    apiKey: string
  }
  pollTimeout: number
  pollInterval: number
  isLog: boolean
}

export const Config: Schema<Config> = Schema.object({
  nyaProfiler: Schema.object({
    apiKey: Schema.string()
      .role('secret')
      .required()
      .description('Re Nya Profiler 的 API Key （从 https://renya.milthm.top/ 中获取）')
  }).description('Re Nya Profiler API 配置'),

  pollTimeout: Schema.number()
    .default(300)
    .description('授权轮询超时时间（秒）'),

  pollInterval: Schema.number().default(5).description('授权轮询间隔（秒）'),

  isLog: Schema.boolean().default(false).description('是否输出 debug 日志')
})

export const name = 'milthm-profiler'

export default Config
