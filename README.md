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
| V1 Energy Monitoring MVP | 设备、能耗看板、告警、Demo 数据、基础报表 | 进行中 |
| V2 Industry Dashboard Engine | 行业模板、Tag 方案、可编辑看板、Widget Builder | 进行中 |
| V3 Device & Data Foundation | 真实设备数据、数据中心、指标查询、导出 | 规划中 |
| V4 Control Center | 远程控制、参数下发、控制日志、权限校验 | 规划中 |
| V5 Workflow Automation | Trigger / Condition / Action、通知、Webhook、任务与报告自动化 | 进行中 |
| V6 AI Copilot | 自然语言查询、异常分析、建议动作、生成报表与工作流 | 规划中 |
| V7 Partner / White Label | 多租户、客户管理、白标、代理商后台 | 规划中 |

### V1: Energy Monitoring MVP

目标：先完成可演示、可查询、可扩展的工业能耗监控基础版本。

- [x] Overview 总览中心
- [x] 设备列表与设备详情
- [x] 设备 Tags 筛选
- [x] Demo 设备、告警、能耗和工作流数据
- [x] 告警中心基础页面
- [x] 报表中心基础页面
- [x] PM2 + VPS 自动部署
- [x] 接入真实设备数据 API / MQTT WebSocket Bridge 前端入口
- [ ] 替换 Mock 告警和能耗数据
- [ ] 基础报表导出

### V2: Industry Dashboard Engine

目标：形成“Dashboard Engine + Industry Templates”，而不是一个写死的看板。

- [x] Factory Energy Monitoring 模板
- [x] Solar Monitoring 模板
- [x] Cold Storage Monitoring 模板
- [x] Water Pump Monitoring 模板
- [x] Air Compressor Monitoring 模板
- [ ] CNC Machine Monitoring 模板
- [x] Tag 对应方案与看板
- [x] 模板新增、编辑、删除、保存
- [x] Drag & Drop 看板布局
- [x] Widget 磁性对齐与参考线
- [x] Widget Builder
- [x] 可用 Widget 拖入看板
- [x] Widget 标题、图标、绑定设备、显示方式配置
- [x] Number / Line / Area / Bar / Gauge / Status / Donut 显示方式
- [x] 一键 Auto Layout 排版
- [ ] Widget 阈值、单位、精度、颜色规则配置
- [ ] Widget 模板市场 / 预设库

### V3: Device & Data Foundation

目标：从前端 Demo 走向真实工业 IoT 数据底座。

- [x] 支持多类型设备抽象：energy_meter、plc、temperature_sensor、solar_inverter、pump_controller、air_compressor、gateway
- [x] 设备 Tags 分组
- [ ] 站点 Site / Tenant 数据模型
- [ ] MQTT Broker 接入：EMQX / Mosquitto
- [ ] 工业协议接入规划：Modbus RTU、Modbus TCP、CAN、LoRa、4G、Ethernet、WiFi
- [ ] 原始数据查看
- [ ] 指标筛选
- [ ] 时间范围查询
- [ ] 设备对比
- [ ] 数据导出
- [ ] SQL-like Query / Metric Builder

### V4: Control Center

目标：从“只能看”升级为“可以安全控制”的工业运营平台。

- [ ] 远程开关
- [ ] 远程重启
- [ ] 参数下发
- [ ] 模式切换
- [ ] 手动控制
- [ ] 批量控制
- [ ] 控制记录
- [ ] 权限控制
- [ ] 二次确认
- [ ] 危险操作审批
- [ ] 失败回滚
- [ ] 本地手动优先机制

### V5: Workflow Automation

目标：建设工业版 Zapier / n8n，用规则自动响应设备和运营事件。

- [x] Workflow 页面基础结构
- [x] Trigger / Condition / Action 概念建模
- [x] 设备离线、指标阈值、告警、定时、AI、Webhook、MQTT 等触发类型占位
- [x] 通知、工单、Webhook、报告、AI 分析等动作类型占位
- [ ] 后端工作流执行器
- [ ] 真实通知渠道：Email、WhatsApp、Telegram、SMS、Webhook、Slack
- [ ] Workflow Run 历史
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
- [ ] pgvector / 向量检索
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
- [ ] 角色权限：Owner、Admin、Engineer、Operator、Viewer、Partner、Customer

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
- **报表管理**：提供工业运营报表入口，用于管理、下载或发送报告。
- **系统设置**：支持白标名称、时区、通知渠道、Bark、邮件、Webhook 和用户管理。
- **主题与语言**：内置浅色/深色主题和中英文语言状态。
- **本地持久化**：使用 Zustand persist 保存设备、用户、图表、工作流和界面配置。
- **一键部署到 VPS**：内置 GitHub Actions 自动化部署工作流。

## 系统模块

| 模块 | 路径 | 用途 |
| --- | --- | --- |
| Overview | `/` | 工厂能耗总览、KPI、趋势图、AI 建议和自定义组件。 |
| Devices | `/devices` | 设备资产管理、标签筛选、设备新增编辑和详情查看。 |
| Workflows | `/workflows` | 创建、启用、禁用和编辑自动化工作流。 |
| Analytics | `/analytics` | 创建和查看自定义运营图表。 |
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

### 查看运营总览

进入首页后可以查看核心 KPI、实时功率趋势和 AI 运维建议。Overview 页面中的组件支持拖拽和缩放，也可以通过 **Add Widget** 添加 Analytics 中创建的图表。

### 管理设备

进入 **Devices** 页面后，可以按标签筛选设备，查看设备状态、关键指标和最后在线时间。点击设备名称可进入详情页，更多菜单中可以编辑或删除设备。

### 创建分析图表

进入 **Analytics** 页面，点击 **Add Chart**，填写图表名称，选择数据源和图表类型。创建后的图表可以在 Analytics 页面查看，也可以添加到 Overview 看板。

### 配置自动化工作流

进入 **Workflows** 页面，点击 **Create Workflow** 创建流程。工作流由触发器、条件和动作组成，可用于自动响应设备离线、指标超限、告警产生、计划任务、MQTT 消息或 AI 异常检测。

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

`VPS_DEPLOY_PATH` 指向的目录会由工作流自动执行 `mkdir -p` 创建，但 `VPS_USER` 必须有创建和写入权限。

生产环境会通过 `server.js` 启动 Node 服务，并由 PM2 使用 `ecosystem.config.cjs` 托管。默认应用端口是 `3006`，可通过 GitHub Secret `VPS_APP_PORT` 覆盖。VPS 需要提前安装 Node.js、npm 和 PM2。

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

项目已提供前端真实设备数据接入入口，可通过 `.env.local` 配置 HTTP API 或 MQTT WebSocket Bridge。

### HTTP API

```bash
VITE_DEVICE_API_URL="https://your-api.example.com/devices"
VITE_DEVICE_API_TOKEN="your-api-token"
VITE_DEVICE_API_POLL_MS=10000
```

接口响应支持两种格式：

```json
[
  {
    "device_id": "DEV-001",
    "device_type": "energy_meter",
    "tags": ["factory-a"],
    "metrics": {
      "voltage": 220,
      "current": 18.5,
      "power": 4070,
      "energy_today": 128.6
    },
    "status": "online",
    "timestamp": "2026-06-05T10:00:00Z"
  }
]
```

也可以返回：

```json
{
  "devices": []
}
```

### MQTT / WebSocket Bridge

浏览器端当前不直接内置 MQTT TCP 客户端，而是通过 WebSocket 接收后端或 MQTT Bridge 转换后的 JSON 遥测消息：

```bash
VITE_MQTT_WS_URL="wss://your-api.example.com/iot/telemetry"
```

WebSocket 消息格式：

```json
{
  "device_id": "DEV-001",
  "device_type": "energy_meter",
  "tags": ["factory-a"],
  "metrics": {
    "power": 4070,
    "energy_today": 128.6
  },
  "status": "online",
  "timestamp": "2026-06-05T10:00:00Z"
}
```

接入后，设备列表、总览 Tag 看板、Widget Builder 绑定设备和指标展示都会使用真实设备状态与 metrics。

## 后续接入建议

- 接入真实设备数据 API 或 MQTT 服务。
- 将 Mock 告警、能耗和设备数据替换为后端接口。
- 将 AI Copilot 的模拟回复替换为真实 Gemini API 调用。
- 为工作流增加后端执行器，支持真正的通知、工单、Webhook 和设备控制。
- 增加用户鉴权、角色权限和多站点隔离。
