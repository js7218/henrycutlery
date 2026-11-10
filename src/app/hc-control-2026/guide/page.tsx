'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BookOpen, CheckCircle2, Lightbulb, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Section {
  id: string;
  title: string;
  subtitle: string;
  what: string;
  steps: string[];
  tips?: string[];
  warn?: string;
}

const SECTIONS: Section[] = [
  {
    id: 'start',
    title: '开始之前',
    subtitle: '登录与注意事项',
    what: '后台地址是 adamcutlery.com/hc-control-2026，输入 PIN 后进入。所有操作都会写进日志，改错了可以回滚。',
    steps: [
      '浏览器收藏后台地址，不要用手机浏览器的“翻译”功能——翻译会弄乱页面，甚至让页面报错。',
      '30 分钟没有操作会自动锁屏，重新输 PIN 即可，这是安全设计。',
      '每次改完数据，刷新一下页面确认数字还在，才说明真的存进去了。',
      '看到红色字先别慌，多数是提醒（比如“价格高于市场”），不是报错。',
    ],
  },
  {
    id: 'dashboard',
    title: 'Dashboard 总览',
    subtitle: '一眼看今天有多少活',
    what: '进后台的第一屏，显示客户数、订单数、地址数、待审评价数。下方列出各个模块的入口。',
    steps: [
      '每天上班先看一眼「待审评价」和「订单数」有没有变化。',
      '数字异常（例如订单突然为 0 或暴涨）先排查，再处理别的。',
    ],
  },
  {
    id: 'customers',
    title: 'Customers 客户',
    subtitle: '查人、看单、改订单状态',
    what: '按邮箱、姓名、电话、订单号、地址关键词搜索客户。点开一个客户能看到他的全部订单和地址。',
    steps: [
      '客户来邮件问“我的货到哪了”，用邮箱搜客户，找到订单号。',
      '在订单里把状态改成 shipped，填上运单号，客户会收到带单号的邮件。',
      '客户要改地址：在地址栏直接编辑，不要在备注里写。',
    ],
    warn: '删客户会连带删掉他的订单和地址，除非确定是测试账号，否则不要删。',
  },
  {
    id: 'reviews',
    title: 'Reviews 评价',
    subtitle: '审核客户评价',
    what: '客户提交的评价默认是隐藏的，必须你通过之后才会显示在产品页。',
    steps: [
      '进入后默认显示待审（pending）列表。',
      '看内容决定：真实评价点 approve，垃圾广告或辱骂点 reject。',
      '只有 approve 过的评价才会出现在前台，且带“已验证购买”标记。',
    ],
  },
  {
    id: 'inquiries',
    title: 'Inquiries 询价',
    subtitle: '批量订单询价（不占库存、不收钱）',
    what: '客户在结算页点“询价”提交的表单会进这里。它和订单不同：询价只是意向，需要你人工报价。',
    steps: [
      '每天至少看一次 new 状态的询价，24 小时内必须回复。',
      '看到数量、定制要求、期望交期后，用邮件报价。',
      '报完价把状态改成 Quoted；寄了样品改 Sample Sent；成交改 Won；没戏改 Closed。',
    ],
    tips: [
      '状态只是给你自己看的工作标记，客户看不到。',
      '成交后仍然要让客户在网站正常下单，这样库存和账目才对得上。',
    ],
  },
  {
    id: 'compliance',
    title: 'Compliance 合规',
    subtitle: '这个国家能不能卖这把刀',
    what: '每个国家一张卡片，写着风险等级、受限品类、给客户的提示语、依据的官方链接。客户下单前必须勾选确认，订单里会留记录。',
    steps: [
      '红色 high = 该国有明确限制，客户会看到警示；黄色 medium = 只限制特种刀具；没有提示 = 按允许处理。',
      '系统每天自动核实 8 个国家，看卡片上的 Updated 时间就行，平时不用管。',
      '想立刻核一批，点顶部 Verify 8 (AI)。',
      '要手工改：改 Risk level 和提示语，点 Save。保存过的国家，AI 以后不会再改。',
    ],
    warn: 'AI 想把某国从“禁止”改成“允许”时不会自动生效，会留在 Recent changes 里等你判断。这条保护不要绕过。',
  },
  {
    id: 'shipping',
    title: 'Shipping 基础运费',
    subtitle: '每个国家每公斤收多少钱',
    what: '这里是客户实际支付的运费单价。结算时按“订单总重量 × 该国单价”计算。',
    steps: [
      '找到国家那一行，改单价数字，点 Apply 生效。',
      '改完去前台结算页选这个国家，确认运费算对了。',
      '如果只是想让系统参考市场价，去 Rate Monitor，不要在这里乱改。',
    ],
  },
  {
    id: 'rate',
    title: 'Rate Monitor 运费监控',
    subtitle: '对比市场价、录货代账单',
    what: '上半部分每国一行：你的价格、保底线（Floor）、市场区间、建议价、漂移。下半部分是货代账单录入，用来把估算价校准成真实成本。',
    steps: [
      '看“漂移”列：红色负数表示你比市场贵，正数表示便宜。',
      '想改价：点金色建议价会把数字填进输入框，再点 Apply 才真正生效。',
      '保底线 Floor 是最低售价，低于它系统拒绝自动降价。',
      '拿到货代账单后，在下半部分选国家、填重量（kg）、填账单金额（美元）、填渠道，点 Add bill。',
    ],
    tips: [
      '系统每天自动抓市场价：变化小于 15% 自动改，大于 15% 等你确认。',
      '账单录得越多，运费越准。目前建议先走美/英/澳三票试单。',
    ],
    warn: '市场公开价通常不含你的头程、清关和人工，不要直接把所有国家套成市场价，会亏运费。',
  },
  {
    id: 'samples',
    title: 'Samples 样品',
    subtitle: '客户申请样品',
    what: '客户在产品页点 Request a Sample 提交的申请会进这里，含联系人、公司、国家、产品、数量、地址。',
    steps: [
      '看到 new 就联系客户，确认地址和运费谁承担。',
      '联系后把状态改成 contacted；寄出后改 sent；结束后改 closed。',
      '状态下拉选完立即保存，没有 Save 按钮。',
    ],
    tips: ['样品寄出后建议在备注里写运单号，方便客户追问时查询。'],
  },
  {
    id: 'reconciliation',
    title: 'Reconciliation 对账',
    subtitle: '钱到没到、差多少',
    what: '上半部分是月度汇总：订单应收、实收、差额，以及运费收入和实际成本。中间是订单列表，底部是已录的收款记录。',
    steps: [
      '客户汇款到账后，在订单行点 Record payment。',
      '填 Amount USD（实收总额）、Bank fee USD（银行手续费）、Method（HSBC 或 WeChat）、Reference（流水号），点 Save。',
      '检查该行 received 和 variance 是否合理，variance 一般等于手续费等小额差异。',
      '录错就在底部 Recorded payments 里删掉重录。',
    ],
    warn: '金额填“实收总额”，不是差额；手续费单独一栏，否则对账永远是错的。',
  },
  {
    id: 'inventory',
    title: 'Inventory 库存',
    subtitle: '能卖多少件',
    what: '每个产品实际可发货数量。客户下单会原子扣减，保证两个人不会买到同一件。取消或删除待付款订单会自动回补。',
    steps: [
      '改单个产品：直接在表格里的数字框改，再点右上角 Save inventory。',
      '批量改：在 Set every listed product to 输入数字，点 Apply to N shown，再点 Save inventory。',
      '填 0 表示缺货，客户无法下单。',
    ],
    warn: 'Apply 只改界面，必须再点 Save inventory 才入库。这是故意做成两步的，防止手滑清零。',
  },
  {
    id: 'seo',
    title: 'SEO 搜索优化',
    subtitle: '让谷歌能搜到',
    what: '检查页面标题、描述、结构化数据是否完整，并给出修改建议。',
    steps: [
      '按提示逐条补齐缺失项，改完点保存。',
      '优先级：产品页标题与描述 > 首页 > 分类页。',
    ],
  },
  {
    id: 'security',
    title: 'Security 安全',
    subtitle: '谁在试图闯进来',
    what: '显示被拦截的恶意请求、异常登录、封禁记录。',
    steps: [
      '看到大量来自同一 IP 的失败记录，说明有人在试 PIN。',
      '如确认是攻击，可以按提示封禁该 IP。',
      '每隔一段时间更换后台 PIN，尤其是 PIN 曾经发给别人时。',
    ],
  },
  {
    id: 'routine',
    title: '每天 / 每周做什么',
    subtitle: '照这个清单走就不会漏',
    what: '把上面所有模块串成一条固定的日常流程。',
    steps: [
      '每天早：Dashboard 看数字 → Inquiries 回新询价 → Customers 看新订单 → Samples 联系新申请。',
      '每天晚：Reconciliation 录当天到账 → Inventory 核对缺货产品。',
      '每周一：Rate Monitor 看漂移，确认要不要调价；Compliance 看 Recent changes 有没有待确认的放宽。',
      '每月初：Reconciliation 导出上月汇总，核对银行流水总额。',
    ],
  },
];

export default function AdminGuidePage() {
  const [active, setActive] = useState(SECTIONS[0].id);
  const section = SECTIONS.find((item) => item.id === active) ?? SECTIONS[0];

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-16">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-gold" />
            Operation Guide
          </h1>
          <p className="text-sm text-gray-500 max-w-2xl">
            后台每个模块是干什么的、每天该怎么用。用大白话写，新同事照着做就行。
          </p>
        </div>
        <Link href="/hc-control-2026" className="text-sm text-gold whitespace-nowrap">
          &larr; Back to dashboard
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        <nav className="bg-surface border border-border rounded-xl p-3 space-y-1 h-fit">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              className={cn(
                'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                active === item.id
                  ? 'bg-gold text-background font-medium'
                  : 'text-gray-400 hover:text-foreground hover:bg-background/60'
              )}
            >
              {item.title}
            </button>
          ))}
        </nav>

        <section className="bg-surface border border-border rounded-xl p-6 space-y-6">
          <header>
            <h2 className="text-xl font-semibold">{section.title}</h2>
            <p className="text-sm text-gold mt-1">{section.subtitle}</p>
          </header>

          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-2">这个模块是干什么的</h3>
            <p className="text-sm text-gray-400 leading-relaxed">{section.what}</p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-2">怎么操作</h3>
            <ol className="space-y-2">
              {section.steps.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm text-gray-400 leading-relaxed">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-background border border-border text-xs text-gold flex items-center justify-center">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {section.tips && section.tips.length > 0 && (
            <div className="rounded-lg border border-gold/30 bg-gold/5 p-4">
              <h3 className="text-sm font-medium text-gold mb-2 flex items-center gap-2">
                <Lightbulb className="w-4 h-4" />
                小提示
              </h3>
              <ul className="space-y-1.5">
                {section.tips.map((tip) => (
                  <li key={tip} className="text-sm text-gray-400 leading-relaxed">
                    · {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {section.warn && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <h3 className="text-sm font-medium text-red-300 mb-2 flex items-center gap-2">
                <TriangleAlert className="w-4 h-4" />
                千万别这么做
              </h3>
              <p className="text-sm text-red-200/90 leading-relaxed">{section.warn}</p>
            </div>
          )}

          <p className="text-xs text-gray-600 flex items-center gap-2 border-t border-border pt-4">
            <CheckCircle2 className="w-4 h-4 text-gray-500" />
            每一步操作都有日志记录。不确定时先刷新页面确认数据，再决定是否告诉客户。
          </p>
        </section>
      </div>
    </div>
  );
}
