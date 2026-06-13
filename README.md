# AI IoT Dashboard

## Roadmap

本 Roadmap 依据系统最初定义整理，用于记录 AI Industrial Operations Platform 的建设进度。项目目标不是只做一个固定 IoT Dashboard，而是逐步演进为：

```text
设备接入 -> 数据采集 -> 可视化 -> 告警 -> 控制 -> 自动化 -> AI 决策
```

最终产品定义：

```text
An AI-powered industrial operations platform that connects machines, meters and sensors, monitors real-time data, controls devices remotely, automates workflows, and helps industrial teams reduce energy costs and equipment downtime.
```

### 当前进度概览

| 阶段 | 目标 | 当前状态 |
| --- | --- | --- |
| V1 Energy Monitoring MVP | 设备、能耗看板、告警、真实数据入口、基础报表 | 核心闭环已完成 |
| V2 Industry Dashboard Engine | 行业模板、Tag 方案、可编辑看板、Widget Builder | 进行中 |
| V3 Device & Data Foundation | 真实设备数据、PostgreSQL / pgvector、HTTP Push、MQTT Subscriber、Ingest Tokens | 进行中 |
| V4 Control Center | 远程控制、参数下发、控制日志、权限校验 | 基础闭环已完成 |
| V5 Workflow Automation | Trigger / Condition / Action、通知、Webhook、任务与报告自动化 | 进行中 |
| V6 AI Copilot | 自然语言查询、异常分析、建议动作、生成报表与工作流 | 规划中 |
| V7 Partner / White Label | 多租户、客户管理、白标、代理商后台 | 规划中 |

### 最近进度更新

- [x] V1 Energy Monitoring MVP 核心闭环已完成：设备、总览、告警、基础报表、VPS + PM2 自动部署、真实数据入口。
- [x] 后端持久化已切换到 PostgreSQL + pgvector，`app_state`、遥测消息、Workflow Webhook 事件等由后端保存。
- [x] 已支持真实设备数据接入：HTTP Push、多 HTTP Channel、后端 MQTT Subscriber、设备专属 API Path。
- [x] Ingest Token 已改为后台用户级管理，支持 Generate / Revoke / Copy。
- [x] Mock 告警和能耗数据已由设备 metrics 派生，减少前端固定假数据依赖。
- [x] 总览中心 Widget 已支持绑定设备与 metric，并支持单位、精度、阈值、颜色规则配置。
- [x] Widget 模板市场 / 预设库已完成，可从行业预设快速加入可用 Widget。
- [x] 站点 Site / Tenant 数据模型已完成，支持站点管理、租户归属、用户站点绑定和设备站点归属。
- [x] Analytics 图表报告已支持绑定设备和 metric。
- [x] 通知渠道支持同类型多条配置，并按渠道类型提供差异化字段和测试按钮。
- [x] 移动端布局已改为 App-like shell，包含移动端顶部栏、底部导航和设备卡片列表。
- [x] Demo 账户角色已完成：内置 `demo@factory.com / demo123`，Demo 修改仅保存在前端会话中，不写入后端数据库，也不会对设备控制生效。
- [x] 原始数据查询已完成：支持按设备、metric、来源、时间范围和 limit 查询遥测原始 payload，并支持 JSON 导出。
- [x] 工作流条件节点已调整为 IF / ELIF / ELSE 分支语义；多个 Trigger 采用任一触发即可进入后续流程。
- [ ] 下一阶段重点：指标筛选、时间范围分析、设备对比、控制连接器、AI Copilot 真实能力接入。

### V1: Energy Monitoring MVP

目标：先完成可演示、可查询、可扩展的工业能耗监控基础版本。

- [x] Overview 总览中心
- [x] 设备列表与设备详情
- [x] 设备 Tags 筛选
- [x] Demo 设备、告警、能耗和工作流数据
- [x] 告警中心基础页面
- [x] 报表中心基础页面
- [x] PM2 + VPS 自动部署
- [x] 接入真实设备数据 API / 后端 MQTT Subscriber 入口
- [x] 替换 Mock 告警和能耗数据
- [x] 基础报表 CSV 导出
- [x] Demo 演示账户与前端-only 修改隔离

### V2: Industry Dashboard Engine

目标：形成“Dashboard Engine + Industry Templates”，而不是一个写死的看板。

- [x] Factory Energy Monitoring 模板
- [x] Solar Monitoring 模板
- [x] Cold Storage Monitoring 模板
- [x] Water Pump Monitoring 模板
- [x] Air Compressor Monitoring 模板
- [x] Tag 对应方案与看板
- [x] 模板新增、编辑、删除、保存
- [x] Drag & Drop 看板布局
- [x] Widget 磁性对齐与参考线
- [x] Widget Builder
- [x] 可用 Widget 拖入看板
- [x] Widget 标题、图标、绑定设备、显示方式配置
- [x] Number / Line / Area / Bar / Gauge / Status / Donut 显示方式
- [x] 一键 Auto Layout 排版
- [x] Widget 阈值、单位、精度、颜色规则配置
- [x] Widget 模板市场 / 预设库

### V3: Device & Data Foundation

目标：从前端 Demo 走向真实工业 IoT 数据底座。

- [x] 支持多类型设备抽象：energy_meter、plc、temperature_sensor、solar_inverter、pump_controller、air_compressor、gateway
- [x] 设备 Tags 分组
- [x] 站点 Site / Tenant 数据模型
- [x] 外部 MQTT Broker 接入：后端订阅 EMQX / Mosquitto 等 Broker
- [x] PostgreSQL + pgvector 后端持久化
- [x] HTTP Push 多通道数据源
- [x] 设备专属 API Path 上报
- [x] 用户级 Ingest Token 管理
- [x] 工业协议接入规划：Modbus RTU、Modbus TCP、CAN、LoRa、4G、Ethernet、WiFi
- [x] 原始数据查看与查询
- [ ] 指标筛选
- [ ] 时间范围查询
- [ ] 设备对比
- [ ] 数据导出
- [x] Device Metrics Mapping：raw telemetry fields 可映射到标准 metrics，并配置显示名、单位、精度和 Primary 标记
- [x] Device Data Quality：统一判定 Live / Stale / Offline / Never Reported，并在设备列表、详情、总览和 SCADA 中避免把过期数据当实时数据展示
- [x] Device Ingest Diagnostics：设备详情页可诊断 MQTT/HTTP 绑定、最近 raw telemetry、mapping 覆盖率，并生成测试请求；Raw Data 可显示匹配设备或未匹配原因
- [x] Device Provisioning：支持设备型号模板、生产设备库存、CSV 批量导入、Claim Code 安全认领、撤销认领和审计日志，以及在添加设备时通过 MAC / IMEI / Serial Number 自动配置设备
- [ ] SQL-like Query / Metric Builder

### V4: Control Center

目标：从“只能看”升级为“可以安全控制”的工业运营平台。

- [x] 控制中心页面
- [x] 远程开关
- [x] 远程重启
- [x] 参数下发
- [x] 模式切换
- [x] 手动控制
- [ ] 批量控制
- [x] 控制记录
- [x] 权限控制
- [x] Demo 角色禁止下发真实设备命令
- [x] 二次确认
- [ ] 危险操作审批
- [ ] 失败回滚
- [ ] 本地手动优先机制

### V5: Workflow Automation

#### Workflow Automation Backlog

- [x] Draft / Published workflow version metadata.
- [x] Published workflow snapshot execution with backward compatibility for legacy workflows.
- [x] Workflow version history, publish notes, draft comparison, and rollback-to-draft.
- [x] Trigger cooldown / dedupe configuration.
- [x] Node-level test run API and editor action.
- [x] Node execution policy: timeout, retry attempts, retry interval, fixed/exponential backoff, stop/continue on failure.
- [x] Expression builder with variable picker, preview, and unresolved reference hints.
- [x] Workflow dry-run simulator with full-flow logs and no external side effects.
- [x] Workflow preflight validation with error/warning/info severity before publish.
- [x] Expression helper functions: now(), formatDate(), toNumber(), round(), contains(), default(), upper(), lower().
- [x] Workflow import / export JSON.
- [x] Workflow template library / preset workflows.
- [ ] Workflow template marketplace.
- [x] Sub-workflow invocation with Run Workflow node, payload mapping, dry-run support, logs, and recursion protection.
- [x] Advanced cron editor for Schedule Trigger with visual modes, generated cron, next-run preview, and validation.
- [x] Node search and keyboard shortcuts.
- [ ] Canvas mini map, grouping, comments, and collapse/expand.
- [ ] Redis/BullMQ production execution queue for multi-instance deployments.
- [x] Workflow run metrics: total runs, success rate, failure count, average duration, last run, and per-workflow summaries.
- [x] Workflow run detail diagnostics: click metrics into logs, status filters, node duration, failed-node highlight, and copy input/output/error.
- [x] Workflow run alerting: per-workflow failure, consecutive failure, failure-rate, slow-run, timeout, cooldown, and notification-channel policies.

目标：建设工业版 Zapier / n8n，用规则自动响应设备和运营事件。

- [x] Workflow 页面基础结构
- [x] Trigger / Condition / Action 概念建模
- [x] 多 Trigger 任一触发执行
- [x] IF / ELIF / ELSE 条件分支执行模型
- [x] 设备离线、指标阈值、告警、定时、AI、Webhook、MQTT 等触发类型占位
- [x] 通知、工单、Webhook、报告、AI 分析等动作类型占位
- [x] 后端工作流执行器
- [ ] 真实通知渠道：Email、WhatsApp、Telegram、SMS、Webhook、Slack
- [x] Workflow Run 历史
- [ ] 自动报告
- [ ] 设备控制动作接入

### V6: AI Copilot

目标：AI 不只是聊天机器人，而要具备分析、解释、建议、执行四类能力。

- [x] AI Insights 页面基础界面
- [x] Overview AI 运维助手卡片
- [ ] 自然语言查询设备、告警、能耗和报表
- [ ] 异常原因分析
- [ ] 相关设备定位
- [ ] 建议动作
- [ ] AI 生成报表
- [ ] AI 创建工作流
- [ ] RAG 知识库
- [x] PostgreSQL + pgvector 存储入口
- [ ] Tool Calling 执行控制、报告、工作流等动作

### V7: Partner / White Label

目标：支持系统集成商、自动化公司、能源服务商、Solar EPC、Electrical Contractor 面向自己的客户交付平台。

- [ ] 多租户 Tenant / Site
- [ ] 客户管理
- [ ] 项目管理
- [ ] 白标 Logo
- [ ] 自定义域名
- [ ] 代理商后台
- [ ] 客户子账号
- [ ] 项目报价记录
- [x] 基础角色权限：Owner、Admin、Engineer、Operator、Viewer、Demo、Partner、Customer
- [x] Demo 账户本地演示模式：允许体验界面和配置流程，但不持久化到后端、不影响设备
- [ ] 更细粒度 RBAC：菜单、站点、设备、控制动作、数据源、Token 权限矩阵

### 技术演进方向

- 前端：React、TypeScript、Vite、Tailwind CSS、Zustand、Recharts、React Grid Layout
- 后端：Node.js + NestJS 或 Python FastAPI
- 数据库：PostgreSQL、TimescaleDB、Redis、pgvector
- IoT：MQTT Broker、Modbus、CAN、LoRa、HTTP、WebSocket
- AI：RAG Knowledge Base、AI Agent、Tool Calling、Report Generator
- 部署：Docker、Cloudflare、PM2、VPS、Object Storage、可选 Grafana

AI IoT Dashboard 是一个面向工业物联网场景的运维监控后台，用于集中管理设备、查看能耗与告警、配置自动化工作流，并通过 AI Copilot 辅助分析设备状态和运营异常。

系统当前以 Vite + React 构建，内置模拟设备、告警、能耗和工作流数据，适合用于演示、二次开发、部署到自有 VPS 或接入真实 IoT 数据源。

## 功能特性

- **运营总览看板**：展示设备总数、在线设备、今日能耗、活跃告警等核心指标。
- **可拖拽仪表盘**：Overview 页面支持拖拽、缩放组件，并可添加自定义分析图表。
- **实时趋势图**：展示功率趋势、基准线对比和运行状态变化。
- **设备管理**：支持设备列表、标签筛选、设备详情、添加、编辑和删除。
- **多类型工业设备**：覆盖 DTU、RTU、网关、LoRa 网关、PLC、智能电表、温度传感器、空压机等设备类型。
- **告警中心**：展示设备异常、告警等级、告警状态，并提供确认告警和创建工单入口。
- **数据分析**：支持创建柱状图、折线图、饼图，数据源包括能耗、设备健康和告警频率。
- **自动化工作流**：支持基于触发器、条件和动作的事件驱动流程，例如阈值告警、设备离线、定时任务、Webhook、MQTT、AI 分析、通知和工单。
- **AI Copilot**：提供自然语言问答界面，用于分析能耗、告警和设备健康状态。
- **用户权限与 Demo 模式**：支持登录、注册、后台审核用户角色，并提供 Demo 账户用于演示；Demo 账户的修改只保存在前端会话，不写入后端数据库，也不会下发设备控制命令。
- **报表管理**：提供工业运营报表入口，用于管理、下载或发送报告。
- **系统设置**：支持白标名称、时区、通知渠道、Bark、邮件、Webhook 和用户管理。
- **主题与语言**：内置浅色/深色主题和中英文语言状态。
- **后端持久化**：使用 PostgreSQL + pgvector 保存设备、用户、看板、工作流、通知配置、MQTT 配置和遥测数据。
- **一键部署到 VPS**：内置 GitHub Actions 自动化部署工作流。

## 系统模块

| 模块 | 路径 | 用途 |
| --- | --- | --- |
| Overview | `/` | 工厂能耗总览、KPI、趋势图、AI 建议和自定义组件。 |
| Devices | `/devices` | 设备资产管理、标签筛选、设备新增编辑和详情查看。 |
| Workflows | `/workflows` | 创建、启用、禁用和编辑自动化工作流。 |
| Analytics | `/analytics` | 创建和查看自定义运营图表。 |
| Raw Data | `/raw-data` | 查询 HTTP Push、设备专属 API Path 和 MQTT Subscriber 写入的原始遥测数据。 |
| Alerts | `/alerts` | 查看告警、确认告警、创建工单。 |
| Reports | `/reports` | 管理运营报告。 |
| AI Insights | `/ai-insights` | 通过 AI Copilot 查询运营问题。 |
| Settings | `/settings` | 配置系统、通知渠道和用户。 |
| Profile | `/profile` | 当前用户信息。 |

## 快速开始

**环境要求：**

- Node.js 20 或更高版本
- npm

1. 安装依赖：

   ```bash
   npm install
   ```

2. 配置环境变量：

   ```bash
   cp .env.example .env.local
   ```

   然后在 `.env.local` 中填写：

   ```bash
   GEMINI_API_KEY="your-gemini-api-key"
   ```

3. 启动开发服务：

   ```bash
   npm run dev
   ```

   默认运行端口是 `3006`。如需指定端口，可以使用环境变量：

   Linux/macOS:

   ```bash
   PORT=4000 npm run dev
   ```

   Windows PowerShell:

   ```powershell
   $env:PORT=4000; npm run dev
   ```

   也可以直接传递 Vite 参数：

   ```bash
   npm run dev -- --port 4000
   ```

4. 打开浏览器访问：

   ```text
   http://localhost:3006
   ```

   如果你指定了其他端口，请把地址中的 `3006` 替换为对应端口。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动本地开发服务，默认端口 `3006`。 |
| `npm run build` | 构建生产版本到 `dist`。 |
| `npm run preview` | 本地预览生产构建，默认端口 `3006`。 |
| `npm start` | 使用 `server.js` 启动生产 Node 服务。 |
| `npm run pm2:start` | 使用 PM2 启动生产服务。 |
| `npm run pm2:reload` | 使用 PM2 重载生产服务。 |
| `npm run lint` | 运行 TypeScript 类型检查。 |

## 使用说明

### Demo 演示账户

登录页内置 Demo 账户：`demo@factory.com / demo123`。

Demo 角色用于体验系统界面和配置流程。该账户产生的看板、设备、工作流、设置等修改只保存在当前前端会话中，不会同步保存到后端 PostgreSQL 数据库；控制中心也不会向后端或真实设备下发控制命令。

### 查看运营总览

进入首页后可以查看核心 KPI、实时功率趋势和 AI 运维建议。Overview 页面中的组件支持拖拽和缩放，也可以通过 **Add Widget** 添加 Analytics 中创建的图表。

### 管理设备

进入 **Devices** 页面后，可以按标签筛选设备，查看设备状态、关键指标和最后在线时间。点击设备名称可进入详情页，更多菜单中可以编辑或删除设备。

### 创建分析图表

进入 **Analytics** 页面，点击 **Add Chart**，填写图表名称，选择数据源和图表类型。创建后的图表可以在 Analytics 页面查看，也可以添加到 Overview 看板。

### 查询原始数据

进入 **Raw Data** 页面后，可以按设备、metric、数据来源、时间范围和返回条数查询 `telemetry_messages` 中保存的原始遥测 payload。查询结果会显示接收时间、设备、来源、Topic 和 metrics 摘要，点击任意记录可查看完整 JSON，也可以导出当前查询结果。

后端查询接口为：

```text
GET /api/telemetry?deviceId=AIR-COMP-001&metric=pressure&source=mqtt&from=2026-06-01T00:00:00.000Z&to=2026-06-07T23:59:59.000Z&limit=200
```

### 配置自动化工作流

进入 **Workflows** 页面，点击 **Create Workflow** 创建流程。工作流由触发器、IF / ELIF / ELSE 条件分支和动作组成，可用于自动响应设备离线、指标超限、告警产生、计划任务、MQTT 消息或 AI 异常检测。一个工作流可以配置多个 Trigger，任意一个 Trigger 被触发后都会进入后续条件分支；IF / ELIF / ELSE 会按顺序匹配，系统只执行第一个匹配分支下的 actions。

Workflows 页面支持 **Template Library** 与 **Import JSON / Export JSON**。模板会创建为未启用草稿，导入时会重新生成 workflow、node、edge ID，并为 Webhook Trigger 重新生成当前域名下的 endpoint，避免复用旧环境的地址或误触发已启用流程。

工作流编辑页支持 **Dry Run**。可以选择某个 Trigger，使用 Access、NFC、MQTT、Webhook、Schedule、Threshold 等示例输入或自定义 JSON 来模拟执行当前草稿。Dry Run 会复用真实分支、表达式和节点执行逻辑，但不会写入真实工作流日志、不会发送通知渠道、不会调用外部 Webhook，也不会向设备下发控制命令；模拟结果会临时显示在 Logs 窗口中。

工作流编辑页支持 **Versions**。每次 **Publish Version** 都需要填写发布说明，并保存 published snapshot 到版本历史。版本历史可查看发布人、发布时间、节点摘要、发布说明，也可以比较当前 Draft 与历史版本的新增、删除和修改节点；选择 **Restore to Draft** 会把历史版本恢复到当前草稿，用户仍需再点击 Save Draft 或 Publish Version 才会固化。

工作流编辑页支持 **Validate** 发布前校验。校验结果分为 Error、Warning、Info：Error 会阻止发布，例如缺少 Trigger、设备控制未绑定设备或控制项、Webhook URL 非法、Access Trigger 未绑定 Access；Warning 会在发布前提示确认，例如通知消息为空、Trigger 未配置 cooldown、静态设备绑定未找到；Info 用于提示外部副作用节点等结构信息。点击带节点信息的校验项可以定位到对应节点。

工作流编辑页支持 **Search Nodes** 与快捷键操作。可以按节点名称、节点类型、设备 ID、Access ID、配置内容或变量引用快速定位节点；`Ctrl/Cmd + K` 打开搜索，`Ctrl/Cmd + S` 保存草稿，`Ctrl/Cmd + Enter` 打开 Dry Run，`Esc` 关闭当前弹层。

工作流表达式支持函数 helper，可在通知消息、Webhook body、设备控制表达式、IF / CASE 条件、Set 节点等配置字段中使用。当前支持 `now()`、`formatDate(value, format)`、`toNumber(value)`、`round(value, decimals)`、`contains(value, keyword)`、`default(value, fallback)`、`upper(value)`、`lower(value)`；变量选择器中提供 **Function Helpers** 插入入口，预览区会显示解析结果、未解析变量和函数参数错误。

工作流支持 **Run Workflow** 子工作流调用节点。父流程可以选择一个已发布工作流，或用表达式指定 `workflowId`，并通过 Payload JSON / Payload Expression 传入参数；子流程输出会写入父节点 output，可继续通过 `$.run_workflow.output.status`、`$.run_workflow.output.result`、`$.run_workflow.output.steps` 等引用。系统会记录父流程与子流程各自的 Logs，并内置递归检测与最大调用深度，避免工作流互相调用造成死循环。Dry Run 会以无外部副作用模式执行子流程。

`Schedule` Trigger 支持可视化 Cron 编辑。可以选择 Every N minutes / hours、Daily、Weekly、Monthly 或 Custom cron，编辑器会自动生成 `crontab` 并显示未来 5 次运行时间；Validate 会检查 cron 字段是否合法，并在计划过于频繁时给出 warning。

Workflows 列表支持运行指标总览，会基于最近 workflow run logs 计算 Total Runs、Success Rate、Failed Runs、Avg Duration 和 Last Run；每个 workflow 卡片会显示最近运行状态、失败数、成功率和平均耗时，Logs 窗口也会显示当前 workflow 的运行摘要。点击 Failed Runs / Last Run 可直接打开对应 workflow 的 Logs 并定位到运行记录；Logs 支持 All / Success / Failed / Running 筛选，节点详情会显示执行耗时、失败节点高亮，并可复制 Trigger Event、Input、Output 或 Error。

Workflow 编辑页支持 **Run Alerting**。可为单个 workflow 启用运行异常告警，并配置任一运行失败、连续失败次数、最近 N 次失败率、平均运行耗时、单次运行超时和冷却时间。告警可写入右上角系统 Notifications，也可推送到已启用的 Notification Channels；告警内容会带上 workflow、run ID、状态、失败节点和错误摘要，方便直接回到 Logs 定位。

当添加 **Webhook** Trigger 时，系统会基于当前 Dashboard 域名生成唯一 endpoint，例如 `https://your-dashboard-domain.com/api/workflow-webhooks/{workflowId}/{token}`。外部系统 POST 到该地址后，后端会记录 webhook payload，后续可由工作流执行器消费。

后端工作流执行器已内置在 `server.js` 中：

- HTTP Push、设备专属 API Path 和 MQTT Subscriber 收到遥测后，会触发启用状态的工作流。
- 已支持 `threshold`、`offline`、`alert`、`mqtt_message`、`webhook`、`schedule` 触发类型。
- 已支持 IF / ELIF / ELSE 条件分支；Trigger 触发后会按顺序匹配分支，只执行第一个匹配分支下的 actions。
- `webhook` 动作会由后端真实 POST 到目标 URL；`mqtt_publish`、`start_backup`、`stop_device` 会写入控制中心命令日志；`email`、`whatsapp`、`notification`、`ticket`、`report`、`ai_analyze` 会先写入执行步骤，作为后续真实连接器的队列记录。
- 执行历史可通过 `GET /api/workflow-runs` 查看，也可以用 `GET /api/workflow-runs?workflowId=wf-xxx&limit=50` 查看单个工作流。

### 使用控制中心

进入 **Control Center** 页面后，可以选择 Site、可控设备和控制命令。当前支持的控制命令包括：

- `power_on` / `power_off`：远程开关。
- `restart`：远程重启。
- `set_mode`：切换运行模式，例如 Auto、Manual、Eco、Maintenance。
- `set_speed`：下发速度百分比。
- `set_parameter`：下发任意参数名和值。

控制命令提交前需要勾选二次确认。后端会通过 `POST /api/device-commands` 记录命令、设备、参数、操作者、角色、来源和状态，并可通过 `GET /api/device-commands` 查询控制日志。

当前支持两种下行方式：

1. **MQTT Command Topic**：如果设备配置了 `MQTT Command Topic`，或可从 `MQTT Topic` 推导出 `{telemetry-topic-without-/telemetry}/command`，并且后端 MQTT Subscriber 已连接，控制命令会被 publish 到该 topic，状态变为 `sent`。
2. **设备 / 网关主动拉取**：如果没有可用 MQTT 连接，命令会保持 `queued`，现场网关可通过 `GET /api/device-commands/pending?deviceId=DEVICE_ID` 拉取待执行命令，执行后通过 `POST /api/device-commands/{commandId}/ack` 回传结果。

网关拉取 pending 命令示例：

```bash
curl "http://localhost:3006/api/device-commands/pending?deviceId=AIR-COMP-001" \
  -H "x-iot-token: iot_generated_token"
```

设备 ACK 示例：

```bash
curl -X POST "http://localhost:3006/api/device-commands/cmd-xxx/ack" \
  -H "Content-Type: application/json" \
  -H "x-iot-token: iot_generated_token" \
  -d '{"status":"success","message":"Command executed by gateway"}'
```

Modbus、CAN、PLC 等现场协议仍建议由边缘网关转换执行：Dashboard 负责生成命令、下发到 MQTT 或 pending queue，网关负责写线圈、写寄存器、发 CAN Frame 或调用设备私有协议。

### 处理告警

进入 **Alerts** 页面查看当前告警列表。活跃告警可以执行确认操作，也可以通过创建工单入口进入后续处理流程。

### 使用 AI Copilot

进入 **AI Insights** 页面，可以用自然语言询问设备、能耗、告警和运营异常相关问题。当前实现为前端模拟响应，后续可接入真实 Gemini 或其他 AI 服务。

### 配置通知和用户

进入 **Settings** 页面，可以配置公司名称、系统时区、Bark 推送地址、告警邮箱、Webhook 地址，并管理平台用户。

## 部署到 VPS

项目已经内置 GitHub Actions 自动化部署工作流：

- 工作流文件：`.github/workflows/deploy-vps.yml`
- 部署说明：`docs/vps-deploy.md`

部署支持两种触发方式：

- 推送到 `main` 分支后自动部署。
- 在 GitHub Actions 页面手动点击 **Run workflow** 一键部署。

需要在 GitHub 仓库的 `Settings -> Secrets and variables -> Actions` 中配置：

| Secret | 说明 |
| --- | --- |
| `VPS_HOST` | VPS IP 或域名。 |
| `VPS_USER` | SSH 登录用户。 |
| `VPS_SSH_KEY` | SSH 私钥。 |
| `VPS_DEPLOY_PATH` | PM2 应用部署目录，例如 `/var/www/ai-iot-dashboard`。 |
| `DATABASE_URL` | PostgreSQL / pgvector 连接字符串，例如 `postgresql://user:password@host:5432/ai_iot_dashboard`。 |

`VPS_DEPLOY_PATH` 指向的目录会由工作流自动执行 `mkdir -p` 创建，但 `VPS_USER` 必须有创建和写入权限。

生产环境会通过 `server.js` 启动 Node 服务，并由 PM2 使用 `ecosystem.config.cjs` 托管。默认应用端口是 `3006`，可通过 GitHub Secret `VPS_APP_PORT` 覆盖。VPS 需要提前安装 Node.js、npm 和 PM2。数据库需要启用 `pgvector` 扩展，服务启动时会自动执行 `CREATE EXTENSION IF NOT EXISTS vector` 并创建基础表。

更多 VPS、Nginx 和可选 Secret 配置请查看 [docs/vps-deploy.md](docs/vps-deploy.md)。

## 技术栈

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Zustand
- React Router
- Recharts
- React Grid Layout
- Lucide React
- Motion

## 项目结构

```text
.
|-- .github/workflows/        # GitHub Actions 自动部署
|-- docs/                     # 部署与项目文档
|-- src/
|   |-- components/           # 通用组件
|   |-- lib/                  # 状态、工具、Mock 数据、国际化
|   |-- types/                # 类型定义
|   |-- views/                # 页面视图
|   |-- App.tsx               # 路由配置
|   `-- main.tsx              # 应用入口
|-- index.html
|-- package.json
|-- tsconfig.json
`-- vite.config.ts
```

## 真实设备数据接入

项目已提供真实设备数据接入入口。推荐方式是网关通过 HTTP 主动 POST 遥测数据到 Dashboard 后端；也可以让 Dashboard 后端连接外部 MQTT Broker 并订阅 Topic。前端统一只读取 Dashboard 后端的 `/api/telemetry` 缓冲区。

同一种数据源类型支持配置多条通道。可以在后台 **Settings -> Data Sources** 中新增多个 HTTP Push endpoint 或多个 MQTT Subscriber，例如不同厂区、不同网关、不同客户站点各用独立通道。配置会保存到 PostgreSQL 的 `app_state` 表；未配置 `DATABASE_URL` 的本地演示环境才会回退到服务器本地 `runtime-config.json`。

### Device Metrics Mapping

不同设备上报的字段名可能不同，例如 `pwr`、`kw`、`active_power` 都可能表示系统里的标准指标 `power`。进入 **Device Details -> Metrics Mapping** 后，系统会根据该设备历史 telemetry logs 自动列出已经出现过的 raw fields；可以将每个 raw field 映射为标准 metric，并配置显示名称、单位、精度和是否作为 Primary metric。

保存 mapping 后：

- 后续 MQTT / HTTP 上报会保留原始字段，同时自动生成映射后的标准字段。
- Overview widgets、Analytics charts、SCADA 和 Reports 可直接绑定标准 metric，例如 `power`、`energy`、`temperature`。
- 设备详情页的 Live Metrics 会优先使用 mapping 中的显示名称、单位和精度。

### Device Data Quality

系统会统一区分设备状态和数据新鲜度：

- `Live`：设备最近一次 telemetry 仍在 freshness timeout 内，实时看板可使用当前值。
- `Stale`：设备未开启自动离线判定，但最近一次 telemetry 已超过 freshness timeout；总览、SCADA 和设备列表不再把最后一次值当作实时值展示。
- `Offline`：设备自身上报 offline，或设备开启了 offline detection 且超过配置时间未上报。
- `Never Reported`：设备还没有任何有效 telemetry。

设备详情页提供 **Data Quality** 面板，可查看最近上报年龄、freshness timeout、offline rule、metric logs 数量、未映射字段和非数字字段。设备列表会显示 `No Live Data`，避免过期读数被误认为当前实时数据。

### Device Ingest Diagnostics

设备详情页提供 **Diagnostics** 面板，用于快速判断真实设备数据卡在哪一步：

- 显示当前设备的 Data Source、External Device ID、HTTP endpoint 和 MQTT topic。
- 检查后台 MQTT Subscriber 是否有匹配 topic filter，以及对应 channel 是否 connected。
- 显示最近一次匹配到该设备的 raw telemetry，包括 source、topic 和 received time。
- 统计 metric mapping 覆盖率，帮助发现 raw fields 尚未映射到标准 metrics。
- 可一键复制基于当前设备配置生成的 HTTP curl 或 MQTT publish 示例。

**Raw Data Query** 页面会标记每条 telemetry 是否匹配到平台设备；未匹配时会提示常见原因，例如缺少 `device_id`、没有 numeric metrics，或没有设备使用该 ID / External Device ID。

### Device Provisioning

生产设备可以先在 **Settings -> Provisioning** 中登记：

1. 建立 **Device Model**，定义型号、设备类型、默认数据源、MQTT topic 模板、HTTP API path 模板、metric mappings、控制项等。
2. 录入或 CSV 批量导入 **Manufactured Devices**，字段包括 `serialNumber`、`mac`、`imei`、`modelNo/modelId`、`batchNo`、`firmwareVersion`。系统会为每台库存设备生成 `Claim Code`，也可以在库存表中重新生成或复制。
3. 用户添加设备时，在 **Auto Provision by MAC / IMEI / Serial Number** 输入设备身份，并填写对应 `Claim Code`。校验通过后系统会匹配库存和型号模板，并填充设备类型、External Device ID、topic/API path、mapping、控制项、SCADA 图标等配置。
4. 保存后库存设备会被标记为 `claimed`，并记录对应的平台 Device ID，避免重复绑定。管理员可以在库存表中 Revoke Claim，让该生产设备重新进入可认领状态。
5. Provisioning 页面会记录 Claim Audit Log，包括成功认领、失败尝试、撤销认领和 Claim Code 重新生成，方便追踪批量出货和客户自助绑定过程。

模板支持占位符：

- `{identity}`：优先使用 Serial Number，其次 IMEI / MAC。
- `{serial}` / `{serialNumber}`
- `{mac}`
- `{imei}`
- `{batch}` / `{batchNo}`

例如 MQTT topic 模板可设置为 `devices/{identity}/telemetry`，命令 topic 可设置为 `devices/{identity}/command`。
- 历史回放会基于设备 mapping 将原始 telemetry logs 转换为标准 metric 后再展示。

### Gateway HTTP Push

网关上报地址：

```text
POST https://your-dashboard-domain.com/api/telemetry
```

后台新增 HTTP Push 通道后，会生成带通道 ID 和 token 的专属地址：

```text
POST https://your-dashboard-domain.com/api/telemetry/{channelId}/{token}
```

推荐在后台 **Settings -> Ingest Tokens** 中生成用户级 token，并让网关携带以下任一认证头。Token 可以随时复制或 Revoke，撤销后会立即停止通过 `/api/telemetry` 接收数据：

```text
x-iot-token: your-token
Authorization: Bearer your-token
```

Token 管理流程：

1. 登录后台并进入 **Settings -> Ingest Tokens**。
2. 输入 token 名称，例如 `Factory A Gateway Token`。
3. 点击 **Generate Token** 生成当前用户名下的 token。
4. 点击 **Copy** 后配置到网关请求头。
5. token 泄露或不再使用时点击 **Revoke**，撤销后该 token 不能继续写入遥测数据。

请求体可以是一条遥测消息，也可以是遥测消息数组：

```json
{
  "device_id": "DEV-001",
  "device_type": "energy_meter",
  "tags": ["factory-a"],
  "metrics": {
    "power": 4070,
    "energy": 128.6
  },
  "status": "online",
  "timestamp": "2026-06-05T10:00:00Z"
}
```

本地测试时可以先启动项目，然后用 mock `curl` 直接推送一条设备数据：

```bash
curl -X POST "http://localhost:3006/api/telemetry" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "DEV-001",
    "device_type": "energy_meter",
    "tags": ["factory-a"],
    "metrics": {
      "power": 4070,
      "energy": 128.6,
      "voltage": 380,
      "current": 10.7
    },
    "status": "online",
    "timestamp": "2026-06-05T10:00:00Z"
  }'
```

如果后台 **Settings -> Data Sources** 中新增了 HTTP Push Channel，请使用该通道生成的专属 URL：

```bash
curl -X POST "http://localhost:3006/api/telemetry/{channelId}/{token}" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "PUMP-001",
    "device_type": "water_pump",
    "tags": ["pump-station"],
    "metrics": {
      "flow_rate": 68.5,
      "pressure": 4.2,
      "motor_temp": 58.3,
      "runtime_hours": 1260
    },
    "status": "online",
    "timestamp": "2026-06-05T10:05:00Z"
  }'
```

也可以一次推送多台设备，适合快速验证总览看板、设备列表和 Widget metrics 选择：

```bash
curl -X POST "http://localhost:3006/api/telemetry" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "device_id": "COLD-ROOM-001",
      "device_type": "cold_storage",
      "tags": ["cold-storage"],
      "metrics": {
        "temperature": -18.4,
        "humidity": 62,
        "door_open_count": 3,
        "compressor_load": 72
      },
      "status": "online"
    },
    {
      "device_id": "AIR-COMP-001",
      "device_type": "air_compressor",
      "tags": ["compressed-air"],
      "metrics": {
        "pressure": 7.8,
        "air_flow": 520,
        "oil_temp": 76,
        "vibration": 1.8
      },
      "status": "warning"
    },
    {
      "device_id": "SOLAR-INV-001",
      "device_type": "solar_inverter",
      "tags": ["solar-site"],
      "metrics": {
        "pv_power": 52.6,
        "daily_generation": 318.4,
        "dc_voltage": 720,
        "inverter_efficiency": 97.2
      },
      "status": "online"
    }
  ]'
```

如果后台已经生成 Ingest Token，mock 请求需要带认证头：

```bash
curl -X POST "http://localhost:3006/api/telemetry" \
  -H "Content-Type: application/json" \
  -H "x-iot-token: iot_generated_token" \
  -d '{"device_id":"DEV-001","metrics":{"power":4100},"status":"online"}'
```

旧版部署中如果仍设置了 `IOT_INGEST_TOKEN`，系统会把它作为兼容 fallback token 加载；新部署建议统一使用后台 **Ingest Tokens** 管理。

Dashboard 前端会自动轮询本机 `/api/telemetry` 缓冲区，并将遥测数据合并到匹配设备。

### Backend MQTT Subscriber

系统不自带 MQTT Broker，但 Dashboard 后端可以连接外部 MQTT Broker 并订阅遥测 Topic。可以在后台 **Settings -> Data Sources** 中配置多条 MQTT Subscriber，每条 Subscriber 独立保存 Broker URL、账号、Topic、启用状态和连接状态。也可以通过环境变量提供一条默认 MQTT 通道：

```bash
MQTT_ENABLED=true
MQTT_BROKER_URL="mqtt://broker.example.com:1883"
MQTT_USERNAME="optional-user"
MQTT_PASSWORD="optional-password"
MQTT_TOPICS="devices/+/telemetry,factory-a/#"
```

当前内置订阅客户端支持 `mqtt://` 和 `mqtts://`，收到消息后会写入同一个 `/api/telemetry` 缓冲区和 `telemetry_messages` 表。多条 MQTT Subscriber 可以同时连接，不需要把所有 Topic 挤进同一个 Broker 配置里。

MQTT Payload 格式：

```json
{
  "device_id": "DEV-001",
  "device_type": "energy_meter",
  "tags": ["factory-a"],
  "metrics": {
    "power": 4070,
    "energy": 128.6
  },
  "status": "online",
  "timestamp": "2026-06-05T10:00:00Z"
}
```

接入后，设备列表、总览 Tag 看板、Widget Builder 绑定设备和指标展示都会使用真实设备状态与 metrics。

### 工业协议接入规划

Dashboard 后端不直接作为 Modbus、CAN、LoRa 或蜂窝网络驱动运行。推荐架构是：

```text
现场设备 / PLC / 仪表
  -> 边缘网关 / DTU / RTU / LoRa Gateway
  -> 协议采集、寄存器解析、单位换算、metric 标准化
  -> HTTP Push 或 MQTT Subscriber
  -> Dashboard 后端 / PostgreSQL / Overview Widgets
```

这样做可以把实时采集、串口、总线和弱网重连放在现场网关侧，Dashboard 专注于设备资产、遥测存储、看板、告警、报表和自动化。

| 现场协议 / 网络 | 推荐采集位置 | 进入 Dashboard 的方式 | 典型配置 |
| --- | --- | --- | --- |
| Modbus RTU | 串口网关、DTU、工业 PC | 网关轮询后通过 HTTP Push 或 MQTT 上报 | Serial Port、Baud Rate、Slave ID、Register / Metric Map |
| Modbus TCP | 边缘网关、工业 PC | 网关通过 TCP 轮询设备后上报 | Device Host、Port `502`、Slave ID、Register / Metric Map |
| CAN | CAN 网关、工业 PC | 网关解析 CAN Frame 后上报标准 metrics | CAN Channel、Bitrate、Frame ID 到 metric 映射 |
| LoRa | LoRa Gateway / LoRaWAN Network Server | Gateway 或 Network Server Webhook / MQTT 上报 | DevEUI、Frequency Plan、Topic 或 Webhook URL |
| 4G | DTU、蜂窝网关 | 网关主动连接 Dashboard HTTP / MQTT | APN、IMEI、External Device ID、Ingest Token |
| Ethernet | 工业网关、PLC、IPC | 局域网采集后上报 | IP Address、Subnet、HTTP / MQTT Channel |
| WiFi | WiFi 网关、无线传感器 | 设备或网关通过 HTTP / MQTT 上报 | SSID、IP Address、External Device ID |

在 **Devices -> Add/Edit Device** 中：

- `Industrial Protocol` 用于记录现场侧协议，例如 `Modbus RTU`、`Modbus TCP`、`CAN`、`LoRa`、`4G`、`Ethernet`、`WiFi`。
- `Data Source` 用于选择平台侧入口，即 `HTTP API`、`MQTT` 或 `Manual / Mock`。
- `External Device ID` 必须与网关上报 payload 中的 `device_id` / `deviceId` / `id` 保持一致。
- Modbus 设备建议填写 `Register / Metric Map`，例如 `40001:power,40002:voltage,40003:current`，由网关转换为 Dashboard 支持的 `metrics` JSON。
- CAN / LoRa 设备建议在网关侧先把原始帧、DevEUI、端口等解析为业务指标，再上报到 Dashboard。

网关最终上报到 Dashboard 的 payload 仍然使用统一格式：

```json
{
  "device_id": "METER-001",
  "device_type": "energy_meter",
  "metrics": {
    "power": 4070,
    "voltage": 380,
    "current": 10.7
  },
  "status": "online",
  "timestamp": "2026-06-07T10:00:00Z"
}
```

### 添加设备时的关联配置

在 **Devices -> Add Device** 中，除了设备名称、类型和 Tags，还需要配置数据绑定信息：

| 字段 | 说明 |
| --- | --- |
| `External Device ID` | 真实 API / MQTT 消息里的 `device_id`、`deviceId` 或 `id`。平台会用它把遥测数据匹配到当前设备。 |
| `Data Source` | 选择 `HTTP API`、`MQTT` 或 `Manual / Mock`。 |
| `API Path` | 可选，用作该设备的专属 HTTP POST 上报路径，例如 `/api/device-ingest/meter-001`。网关 POST 到该路径时，后端会按该路径绑定到当前设备。 |
| `MQTT Topic` | 可选，用于记录该设备的遥测主题，例如 `factory-a/energy/meter-001/telemetry`。 |

实际遥测更新时，系统会优先用 `External Device ID` 匹配设备；如果没有配置，则使用平台内部设备 ID 匹配。

## 后续接入建议

- 接入真实设备数据 API 或 MQTT 服务。
- 将 Mock 告警、能耗和设备数据替换为后端接口。
- 将 AI Copilot 的模拟回复替换为真实 Gemini API 调用。
- 为工作流增加后端执行器，支持真正的通知、工单、Webhook 和设备控制。
- 增加用户鉴权、角色权限和多站点隔离。

## Access Control

Access Control adds QR-link and NFC URL based workflow triggers for visitor, operator, gate, or temporary device-control scenarios.

1. Open `/access-control`.
2. Create an Access entry and set `Extra Parameters JSON`, for example:

   ```json
   {
     "deviceId": "DEV-001",
     "action": "power_on",
     "siteId": "factory-a"
   }
   ```

3. Generate one or more QR or NFC credentials for the Access entry. Each credential can define `name`, `groups`, `periodSeconds`, `refreshIntervalSeconds` for QR, and `maxUses`.
4. Copy the generated random link. The URL uses only a random token:

   ```text
   https://your-domain.com/qr/<random-token>
   https://your-domain.com/nfc/<random-token>
   https://your-domain.com/nfc/<random-token>?uid=00000000000000&ctr=000000&cmac=0000000000000000
   ```

   The link does not contain Access ID, Credential ID, device ID, device name, or other business identifiers.

5. In Workflow Automation, add an `Access Trigger` node and bind it to an Access entry, or leave it as `Any Access`.
6. In a `Device Control` node, set `Device Source` to `From workflow expression` and use:

   ```text
   $.access_trigger.output.params.deviceId
   ```

For ordinary NFC credentials, write the `/nfc/<random-token>` URL to the tag. The backend validates it like a QR credential: token, enabled state, validity period, and remaining uses.

For NFC DNA credentials, configure NTAG424 DNA with UID Mirroring, Counter Mirroring, and CMAC. The backend validates the Access AES Key, `uid`, `ctr`, and `cmac`. The first verified tap auto-binds the credential to that UID, and later taps must use the same UID. Replayed taps where `ctr <= lastCounter` are rejected. Only a verified NFC tap dispatches the `NFC Trigger` workflow event.

When the QR or NFC link is visited, the backend validates that the credential is enabled, within its valid period, still has remaining uses, and belongs to an enabled Access entry. If accepted, it dispatches an Access workflow event containing the Access extra parameters and credential groups.
