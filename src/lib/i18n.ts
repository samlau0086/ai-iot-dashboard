export const translations = {
  en: {
    // Navigation
    nav: {
      overview: 'Overview',
      devices: 'Devices',
      workflows: 'Workflows',
      control: 'Control',
      analytics: 'Analytics',
      rawData: 'Raw Data',
      alerts: 'Alerts',
      reports: 'Reports',
      ai: 'AI Insights',
      settings: 'Settings',
    },
    // Common
    common: {
      search: 'Search devices, alerts, or workflows...',
      switchSite: 'Switch Site',
      cancel: 'Cancel',
      save: 'Save configurations',
    },
    // Overview
    overview: {
      title: 'Overview',
      site: 'Sites',
      totalDevices: 'Total Devices',
      onlineDevices: 'Online Devices',
      energyToday: 'Energy Today',
      activeAlerts: 'Active Alerts',
      realtimeTrend: 'Real-time Power Trend',
      current: 'Current',
      baseline: 'Baseline',
      aiCopilot: 'AI Operations Copilot',
      anomaly: 'ANOMALY DETECTED',
      savings: 'SAVINGS OPPORTUNITY',
      viewDetails: 'View Details',
      applyWorkflow: 'Apply Workflow',
    },
    // Devices
    devices: {
      title: 'Devices',
      desc: 'A list of all industrial devices, gateways, and sensors connected to the platform.',
      addDevice: 'Add Device',
      editDevice: 'Edit Device',
      deleteConfirmTitle: 'Delete Device',
      deleteConfirmDesc: 'Are you sure you want to delete this device? All associated data will be removed. This action cannot be undone.',
      form: {
        name: 'Device Name',
        type: 'Device Type',
        site: 'Tags',
        icon: 'Device Icon',
        config: 'Configuration',
        protocol: 'Protocol',
        ipAddress: 'IP Address',
        port: 'Port',
        baudRate: 'Baud Rate',
        pollingInterval: 'Polling Interval (ms)',
        frequencyPlan: 'Frequency Plan',
        measurementType: 'Measurement Type',
        save: 'Save Device',
        cancel: 'Cancel',
        delete: 'Delete'
      },
      types: {
        dtu: 'DTU',
        rtu: 'RTU',
        gateway: 'Standard Gateway',
        lora_gateway: 'LoRa Gateway',
        sensor: 'Sensor',
        energy_meter: 'Energy Meter',
        plc: 'PLC',
        temperature_sensor: 'Temp Sensor',
        solar_inverter: 'Solar Inverter',
        pump_controller: 'Pump Controller',
        air_compressor: 'Air Compressor'
      },
      table: {
        name: 'Name',
        type: 'Type',
        status: 'Status',
        metric: 'Key Metric',
        lastSeen: 'Last Seen',
        actions: 'Actions',
      }
    },
    // Alerts
    alerts: {
      title: 'Alert Center',
      desc: 'Manage and respond to system alerts and device anomalies.',
      acknowledge: 'Acknowledge',
      createTicket: 'Create Ticket',
    },
    // Energy
    energy: {
      title: 'Energy Analytics',
      weeklyLabel: 'Weekly Consumption by Subsystem',
      costLabel: 'Energy Cost Breakdown (%)',
    },
    // Reports
    reports: {
      title: 'Reports',
      desc: 'Generate and export automated industrial reports for management and billing.',
      generate: 'Generate New Report',
      generatedOn: 'Generated on',
      email: 'Email',
      download: 'Download',
    },
    // Workflows
    workflows: {
      title: 'Workflow Automation',
      desc: 'Create event-driven automated workflows to respond to alerts, device states, and metrics.',
      addNode: 'Add Node',
      triggers: 'Triggers',
      conditions: 'Conditions',
      actions: 'Actions',
      triggerTypes: {
        offline: 'Device Offline',
        threshold: 'Metric Threshold',
        alert: 'Alert Raised',
        schedule: 'Scheduled Task',
        ai: 'AI Anomaly Detected',
        webhook: 'Webhook Event',
        mqtt_message: 'MQTT Message',
      },
      conditionTypes: {
        logic_and: 'Match ALL (AND)',
        logic_or: 'Match ANY (OR)',
        check_state: 'Check Device State',
        time_window: 'Time Window',
      },
      actionTypes: {
        whatsapp: 'Send WhatsApp',
        email: 'Send Email',
        ticket: 'Create Ticket',
        start_backup: 'Start Backup Device',
        stop_device: 'Stop Device',
        webhook: 'Call Webhook',
        report: 'Generate Report',
        ai_analyze: 'Request AI Analysis',
        delay: 'Delay (Timer)',
        mqtt_publish: 'Publish MQTT Message',
        notification: 'System Notification',
      },
      addWorkflow: 'Create Workflow',
      empty: 'No workflows defined yet. Create one to automate responses to factory events.',
      step: 'Step',
    },
    // AI Insights
    ai: {
      title: 'AI Copilot',
      desc: 'Ask questions about your energy usage, alerts, and equipment health.',
      placeholder: "Ask Copilot naturally (e.g. 'Show me abnormal devices today')",
    },
    // Settings
    settings: {
      title: 'Platform Settings',
      desc: 'Manage system configuration, users, and notifications.',
      tabs: {
        general: 'General',
        notifications: 'Notifications',
        users: 'Users',
      },
      whiteLabel: 'Company Name (White Label)',
      timezone: 'System Timezone',
      notifications: 'Notification Channels',
      notificationsDesc: 'Configure how you want to receive system alerts.',
      barkConfig: 'Bark App URl (iOS/Mac)',
      emailConfig: 'Alert Email Address',
      webhookConfig: 'Webhook URL',
    }
  },
  zh: {
    // Navigation
    nav: {
      overview: '总览中心',
      devices: '设备管理',
      workflows: '工作流自动化',
      control: '控制中心',
      analytics: '数据分析',
      rawData: '原始数据',
      alerts: '告警中心',
      reports: '数据报表',
      ai: 'AI 工业助手',
      settings: '系统设置',
    },
    // Common
    common: {
      search: '搜索设备、告警或工作流...',
      switchSite: '切换厂区',
      cancel: '取消',
      save: '保存配置',
    },
    // Overview
    overview: {
      title: '总览',
      site: 'Sites',
      totalDevices: '总设备数',
      onlineDevices: '在线设备',
      energyToday: '今日能耗',
      activeAlerts: '当前告警',
      realtimeTrend: '实时功率趋势 (24h)',
      current: '当前消耗',
      baseline: '基准线',
      aiCopilot: 'AI 运维助手',
      anomaly: '异常检测',
      savings: '节能建议',
      viewDetails: '查看详情',
      applyWorkflow: '应用工作流',
    },
    // Devices
    devices: {
      title: '设备管理',
      desc: '平台上所有接入的工业设备、网关与传感器的详细列表。',
      addDevice: '添加设备',
      editDevice: '编辑设备',
      deleteConfirmTitle: '删除设备',
      deleteConfirmDesc: '确定要删除此设备吗？相关数据将被清除，此操作不可撤销。',
      form: {
        name: '设备名称',
        type: '设备类型',
        site: '标签 (Tags)',
        icon: '设备图标',
        config: '高级配置',
        protocol: '通讯协议',
        ipAddress: 'IP地址',
        port: '端口号',
        baudRate: '波特率',
        pollingInterval: '轮询间隔 (ms)',
        frequencyPlan: '频段计划',
        measurementType: '测量类型',
        save: '保存设备',
        cancel: '取消',
        delete: '删除'
      },
      types: {
        dtu: '数据透传单元 (DTU)',
        rtu: '远程终端单元 (RTU)',
        gateway: '标准网关',
        lora_gateway: 'LoRa 网关',
        sensor: '通用传感器',
        energy_meter: '智能电表',
        plc: '可编程逻辑控制器 (PLC)',
        temperature_sensor: '温度传感器',
        solar_inverter: '光伏逆变器',
        pump_controller: '水泵控制器',
        air_compressor: '空压机'
      },
      table: {
        name: '设备名称',
        type: '设备类型',
        status: '状态',
        metric: '关键指标',
        lastSeen: '最后通讯',
        actions: '操作',
      }
    },
    // Alerts
    alerts: {
      title: '告警中心',
      desc: '管理系统告警事件并响应设备异常。',
      acknowledge: '确认告警',
      createTicket: '创建工单',
    },
    // Energy
    energy: {
      title: '能耗分析',
      weeklyLabel: '各子系统周消耗量',
      costLabel: '能耗成本占比 (%)',
    },
    // Reports
    reports: {
      title: '数据报表',
      desc: '生成并导出面向管理与结算的自动化工业报表。',
      generate: '生成新报表',
      generatedOn: '生成时间',
      email: '发邮件',
      download: '下载',
    },
    // Workflows
    workflows: {
      title: '自动化工作流',
      desc: '创建基于事件驱动的自动化工作流，智能响应设备状态、指标与告警。',
      addNode: '添加节点',
      triggers: '触发器 (Triggers)',
      conditions: '条件 (Conditions)',
      actions: '执行动作 (Actions)',
      triggerTypes: {
        offline: '设备离线',
        threshold: '指标超限',
        alert: '告警产生',
        schedule: '定时任务',
        ai: 'AI 判断异常',
        webhook: 'Webhook 触发',
        mqtt_message: 'MQTT 消息接收',
      },
      conditionTypes: {
        logic_and: '满足所有 (AND)',
        logic_or: '满足任一 (OR)',
        check_state: '检查设备状态',
        time_window: '时间窗口',
      },
      actionTypes: {
        whatsapp: '发送 WhatsApp',
        email: '发送 Email',
        ticket: '创建工单',
        start_backup: '启动备用设备',
        stop_device: '关闭设备',
        webhook: '调用 Webhook',
        report: '生成报告',
        ai_analyze: '通知 AI 分析',
        delay: '延时 (定时器)',
        mqtt_publish: '发布 MQTT 消息',
        notification: '系统通知',
      },
      addWorkflow: '创建工作流',
      empty: '暂无工作流。创建工作流以自动化响应工厂事件。',
      step: '步骤',
    },
    // AI Insights
    ai: {
      title: 'AI 工业助手 (Copilot)',
      desc: '随时提问关于能耗、告警记录和设备健康状态的问题。',
      placeholder: "使用自然语言提问 (例如：'显示今天的所有异常设备')",
    },
    // Settings
    settings: {
      title: '系统设置',
      desc: '管理系统全局配置、用户属性与白标自定义。',
      tabs: {
        general: '常规设置',
        notifications: '通知设置',
        users: '用户管理',
      },
      whiteLabel: '公司名称 (白标配置)',
      timezone: '系统时区',
      notifications: '通知渠道配置',
      notificationsDesc: '配置系统告警推送的目标渠道。',
      barkConfig: 'Bark 推送链接 (iOS/Mac)',
      emailConfig: '告警接收邮箱',
      webhookConfig: '自定义 Webhook',
    }
  }
};

export type Language = 'en' | 'zh';
export type TermKeys = keyof typeof translations.en;
