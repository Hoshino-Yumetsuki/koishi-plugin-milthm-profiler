import { Schema } from 'koishi'

export interface Config {
  nyaProfiler: {
    clientId: string
    secret: string
  }
  milthm: {
    clientId: string
    secret: string
  }
  pollTimeout: number
  pollInterval: number
  isLog: boolean
}

export const Config: Schema<Config> = Schema.object({
  nyaProfiler: Schema.object({
    clientId: Schema.string()
      .required()
      .description('Nya Profiler 的 client_id'),
    secret: Schema.string()
      .role('secret')
      .required()
      .description('Nya Profiler 的 secret')
  }).description('Nya Profiler API 配置'),

  milthm: Schema.object({
    clientId: Schema.string().required().description('Milthm API 的 client_id'),
    secret: Schema.string()
      .role('secret')
      .required()
      .description('Milthm API 的 client_secret')
  }).description('Milthm API 配置'),

  pollTimeout: Schema.number()
    .default(300)
    .description('授权轮询超时时间（秒）'),

  pollInterval: Schema.number().default(5).description('授权轮询间隔（秒）'),

  isLog: Schema.boolean().default(false).description('是否输出 debug 日志')
})

export const name = 'milthm-profiler'

export default Config
