# koishi-plugin-milthm-profiler

Milthm 游戏查分器插件，用于获取和展示 Milthm 游戏的用户数据。

## 使用方法

### 配置

插件需要配置两组凭证：

1. **Nya Profiler 凭证**
   - `client_id`: Nya Profiler 的客户端 ID
   - `secret`: Nya Profiler 的密钥

2. **Milthm API 凭证**
   - `client_id`: Milthm API 的客户端 ID
   - `secret`: Milthm API 的客户端密钥

### 命令

#### `milthm` / `mlt`

查询 Milthm 游戏数据。

执行命令后，插件会：
1. 生成授权链接并发送给用户
2. 等待用户在 60 秒内完成授权
3. 自动获取并展示用户数据

#### `milthm.cancel` / `mlt.cancel`

取消当前进行中的授权请求。

## 许可证
代码使用 MPL 许可证分发，仅供个人学习交流使用，不拥有相关素材的版权。进行分发时应注意不违反素材版权与官方二次创造协定。

背景、立绘等图片素材归属 Morizero 所有
