# 蛇环 · SERPENT ORBIT

一个 360° 自由转向的实时多人「吞噬蛇」竞技场。Node.js 权威服务端 + 原生 Canvas 前端，不需要构建步骤，开箱即玩。

> 没有格子，没有方向键。鼠标、罗盘或键盘指向哪里，蛇就游向哪里。
> 头撞上别人的身体就出局，整条蛇会按积分长度爆成可吞噬的光点。

## 快速开始

```bash
npm install
npm start
```

打开 <http://localhost:3000>。

开发模式（文件变化自动重启服务端）：

```bash
npm run dev
```

默认端口 `3000`，可通过环境变量修改：

```bash
PORT=8080 npm start
```

## 玩法

- **360° 转向**：按住并拖动右下角罗盘、移动鼠标指向，或使用 `WASD` / 方向键。
- **冲刺**：按住 `Shift`、`空格`，或按住右下角闪电按钮。消耗能量，松开后自动恢复。
- **撞身出局**：蛇头碰到任意一条其他蛇的**非头部身体**，或越过环域边界，立即死亡。
- **头对头安全**：两条蛇的头正面相撞不会直接判负；自己的头穿过自己的身体也不会死亡。
- **吞噬成长**：吃掉环域中的光点获得积分，积分会转化为更长的身体、略大的头部与更慢的转向。
- **死亡掉落**：死亡时按 `5 + 积分 × 0.82` 换算掉落总量（上限 360），拆分为多个光点散布在尸体路径周围；任何蛇吃掉这些光点都会增长。
- **AI 对手**：服务端会持续维持 8 条 AI 蛇，它们会寻找食物、避开边界和身体，也会被其他蛇击杀并掉落积分。
- **实时排行榜**：按积分显示存活蛇排名；玩家即使不在前七名，也会固定显示自己的名次。
- **AI 战术复盘**：死亡后由后端 `/api/ai/coach` 生成针对性建议。可接入任意 OpenAI 兼容大模型；未配置模型或模型调用失败时自动使用本地规则建议，不影响游戏运行。

## 操作一览

| 输入 | 作用 |
| --- | --- |
| 鼠标移动 | 追指向光标方向 |
| 拖动右下罗盘 | 任意角度连续转向 |
| `WASD` / 方向键 | 八方向瞄准（罗盘和鼠标可随时接续） |
| `Shift` / `空格` | 按住冲刺 |
| 触屏：拖动屏幕 | 朝触摸位置转向 |
| 触屏：拖动罗盘 | 360° 摇杆转向 |
| 触屏：按住闪电 | 冲刺 |

## 技术结构

```
server/
  index.js                 HTTP 静态服务 + WebSocket 网关 + 主循环 + AI 接口
  ai/
    llmAdvisor.js          可选的大模型战术顾问 + 本地回退
  game/
    constants.js           世界/蛇/食物/网络参数
    geometry.js            角度、距离、轨迹采样
    Snake.js               蛇的移动、长度、转向、冲锋与轨迹
    BotController.js       AI 寻食 / 避障 / 避边界
    GameRoom.js            权威模拟、碰撞、掉落、重生、快照
public/
  index.html
  styles.css
  js/
    app.js                 入口与状态机
    renderer.js            Canvas 渲染、镜头、粒子、小地图
    input.js               鼠标 / 罗盘 / 键盘 / 触屏输入
    ui.js                  HUD、排行榜、死亡面板
    network.js             WebSocket 自动重连
    interpolation.js       20Hz 快照 -> 平滑渲染
    audio.js               程序化音效
    utils.js / config.js
test/
  game-room.test.js        碰撞、掉落、吞食、快照测试
  llm-advisor.test.js      提示词、本地回退、模型调用与失败回退
  llm-api.integration.test.js  HTTP 接口 → 模拟大模型服务全链路
```

### 网络模型

服务端以 `30Hz` 模拟、`20Hz` 下发快照，客户端保留约 `95ms` 的插值延迟，将相邻快照插值到 60fps 渲染。移动、碰撞、积分、掉落全部由服务端裁决，客户端只负责输入和表现。

WebSocket 消息：

- 客户端 → 服务端：`join`、`respawn`、`leave`、`input`、`ping`
- 服务端 → 客户端：`hello`、`joined`、`snapshot`、`notice`、`left`、`pong`

客户端断线后会自动重连并重新入场。无构建工具、无前端依赖，仅服务端使用 [`ws`](https://github.com/websockets/ws)。

## 大模型战术顾问（可选）

大模型**不参与** 30Hz 实时移动，避免推理延迟和成本影响游戏手感；它只负责玩家死亡后的战术复盘。未配置任何模型时，后端会返回本地规则建议，整个项目无需 API Key 也能完整运行。

接入任意 OpenAI 兼容的 `/chat/completions` 服务：

```bash
cp .env.example .env
```

然后编辑 `.env`：

```ini
# DeepSeek 示例
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
LLM_API_KEY=sk-...

# 本地 Ollama 示例（Key 可留空）
# LLM_BASE_URL=http://127.0.0.1:11434/v1
# LLM_MODEL=llama3.2
```

重启服务后生效。服务会自动读取项目根目录的 `.env`，系统环境变量优先。

接口：

- `GET /api/ai/status`：返回是否已配置、模型名和 endpoint host，不泄露密钥。
- `POST /api/ai/coach`：接收 `{ reason, score, length, rank, age, killer }`，返回 `{ mode: "llm" | "local", advice, model, latencyMs }`。
- 失败策略：未配置、超时（默认 9 秒）、限流或上游错误都会返回本地建议；不会阻塞游戏。
- 保护：请求体上限 4KB、同 IP 1.2 秒最短间隔、每分钟最多 20 次，系统提示词隔离并清洗玩家昵称。

## 测试

```bash
npm test
```

覆盖：

- 蛇头撞到其他蛇身体即死亡、击杀归属
- 掉落总量与积分成正比
- 头对头、头部/颈部接触不致死
- 边界死亡
- 吞食积分与长度增长
- 死亡事件只投递一次、快照包含身体数据
- AI 数量维持
- 大模型请求格式、鉴权头、超时/失败回退
- HTTP 接口到模拟大模型服务的真实请求链路

当前共 13 项测试。真实第三方大模型未在本次环境中调用（没有任何模型 Key）；使用本地 mock 服务完成了协议级联调。

## 可调参数

集中在 `server/game/constants.js`，包括环域半径、AI 数量、食物目标数量、基础速度、冲刺能量、转向速率、初始长度、成长系数和掉落上限等。

浏览器端渲染与操作参数可在 `public/js/config.js` 调整，例如插值延迟、输入发送频率与配色。

## 部署提示

- 使用 HTTPS/WSS 时，前端会自动把 `ws://` 切换为 `wss://`。
- 若部署在反向代理后，请放行 WebSocket Upgrade，并把 `/ws` 转发到 Node 服务。
- 当前房间是单进程内存态；多进程横向扩展需要额外的房间路由与共享状态。
