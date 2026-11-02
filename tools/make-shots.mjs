/**
 * Generate the README "screenshots" as SVG mockups of the plugin UI.
 *
 * The mockups use the same layout, colors and typography tokens as the real
 * sidebar, but every topic is a placeholder — no real conversation data ends up
 * in the repository.
 *
 * Run: node tools/make-shots.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const OUT = join(import.meta.dirname, '..', 'docs')
mkdirSync(OUT, { recursive: true })

const W = 340
const H = 780

const COLORS = {
  bg0: '#0e1522',
  bg1: '#1a2333',
  card: 'rgba(255,255,255,0.045)',
  text: '#e7eaf1',
  secondary: '#aab2c4',
  tertiary: '#7f8798',
  accent: '#6ea8fe',
  blue: '#4aa8e8',
  orange: '#f0a05a',
  green: '#46c79a',
}

const TOPICS = [
  '晨间跑步计划',
  '周末露营清单',
  '手冲咖啡参数',
  '阳台种菜记录',
  '城市骑行路线',
  '旧相机维修',
  '窗台植物养护',
  '雨季衣物收纳',
  '记账习惯复盘',
  '学习吉他入门',
  '地铁通勤阅读',
  '周末城郊徒步',
  '冰箱清理计划',
  '睡眠质量观察',
  '旅行行李打包',
  '厨房收纳改造',
  '月度预算梳理',
  '宠物喂养日志',
]

const esc = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const row = (y, { title, time, color = COLORS.tertiary, pin = false, dot = false, spinner = false }) => {
  const parts = []
  if (dot) parts.push(`<circle cx="34" cy="${y}" r="3" fill="${COLORS.green}"/>`)
  parts.push(`<text x="48" y="${y + 4}" fill="${COLORS.text}" font-size="13">${esc(title)}</text>`)
  if (pin) {
    parts.push(
      `<g transform="translate(272 ${y - 5})" stroke="${COLORS.tertiary}" fill="none" stroke-width="1.2">` +
        `<path d="M7 1.5 10.5 5"/><path d="M6.6 5.4 3 9l3.4 3.4L10 8.8"/>` +
        `</g>`,
    )
  }
  if (spinner) {
    parts.push(`<circle cx="292" cy="${y}" r="6" fill="none" stroke="${COLORS.accent}" stroke-width="1.6" stroke-dasharray="22 14"/>`)
  } else if (dot) {
    parts.push(`<circle cx="292" cy="${y}" r="3.5" fill="${COLORS.accent}"/>`)
  } else {
    parts.push(`<text x="318" y="${y + 4}" fill="${color}" font-size="10.5" text-anchor="end">${esc(time)}</text>`)
  }
  return parts.join('')
}

const groupHead = (y, { name, color, count, chevron = true }) => {
  return [
    `<circle cx="30" cy="${y}" r="10" fill="${color}"/>`,
    `<text x="30" y="${y + 4.5}" fill="#fff" font-size="12" font-weight="700" text-anchor="middle">#</text>`,
    `<text x="48" y="${y + 5}" fill="${COLORS.text}" font-size="13.5" font-weight="600">${esc(name)}</text>`,
    chevron ? `<path d="M${48 + name.length * 13 + 10} ${y - 3} l4 4 -4 4" stroke="${COLORS.tertiary}" fill="none" stroke-width="1.2"/>` : '',
    `<text x="268" y="${y + 4}" fill="${COLORS.tertiary}" font-size="10.5" text-anchor="end">${count}</text>`,
    `<circle cx="286" cy="${y}" r="8" fill="none" stroke="${COLORS.tertiary}" stroke-width="1.2"/>`,
    `<path d="M286 ${y - 4} v8 M282 ${y} h8" stroke="${COLORS.tertiary}" stroke-width="1.2"/>`,
    `<circle cx="308" cy="${y}" r="1.6" fill="${COLORS.tertiary}"/><circle cx="314" cy="${y}" r="1.6" fill="${COLORS.tertiary}"/><circle cx="320" cy="${y}" r="1.6" fill="${COLORS.tertiary}"/>`,
  ].join('')
}

const nav = () =>
  [
    `<text x="24" y="42" fill="${COLORS.secondary}" font-size="12.5">新会话</text>`,
    `<text x="24" y="78" fill="${COLORS.secondary}" font-size="12.5">插件</text>`,
    `<text x="24" y="100" fill="${COLORS.secondary}" font-size="12.5">自动化任务</text>`,
  ].join('')

const chrome = (active) => {
  const tab = (label, x, on) =>
    `<g><rect x="${x}" y="112" width="66" height="26" rx="7" fill="${on ? COLORS.card : 'transparent'}"/>` +
    `<text x="${x + 33}" y="130" text-anchor="middle" font-size="12.5" fill="${on ? COLORS.text : COLORS.tertiary}">${label}</text></g>`
  return [
    nav(),
    `<rect x="12" y="106" width="316" height="38" rx="10" fill="rgba(255,255,255,0.03)"/>`,
    tab('分组', 18, active === 'groups'),
    tab('项目', 88, active === 'projects'),
    `<g transform="translate(300 115)"><path d="M4 14h14l-2-3V8a5 5 0 0 0-10 0v3Z" fill="none" stroke="${COLORS.tertiary}" stroke-width="1.3"/><path d="M9 16a2 2 0 0 0 4 0" fill="none" stroke="${COLORS.tertiary}" stroke-width="1.3"/></g>`,
    `<text x="324" y="130" text-anchor="middle" fill="${COLORS.tertiary}" font-size="14">…</text>`,
  ].join('')
}

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">` +
  `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">` +
  `<stop offset="0" stop-color="${COLORS.bg0}"/><stop offset="1" stop-color="${COLORS.bg1}"/>` +
  `</linearGradient></defs>` +
  `<rect width="${W}" height="${H}" fill="url(#bg)"/>` +
  body +
  `</svg>`

// --- group view ------------------------------------------------------------
const groups = [
  {
    y: 160,
    name: '插件',
    color: COLORS.blue,
    count: 3,
    rows: [
      { title: TOPICS[0], time: '刚刚', pin: true },
      { title: TOPICS[1], time: '31分钟' },
      { title: TOPICS[2], time: '42分钟' },
    ],
  },
  {
    y: 300,
    name: '1',
    color: COLORS.orange,
    count: 2,
    rows: [
      { title: TOPICS[3], time: '2小时' },
      { title: TOPICS[4], time: '7小时' },
    ],
  },
]

const ungrouped = [
  { title: TOPICS[5], time: '1天' },
  { title: TOPICS[6], time: '1天' },
  { title: TOPICS[7], time: '2天' },
  { title: TOPICS[8], time: '2天' },
  { title: TOPICS[9], time: '3天' },
  { title: TOPICS[10], time: '3天' },
  { title: TOPICS[11], time: '3天' },
  { title: TOPICS[12], time: '4天', dot: true },
  { title: TOPICS[13], time: '4天' },
  { title: TOPICS[14], time: '5天' },
  { title: TOPICS[15], time: '5天' },
  { title: TOPICS[16], time: '5天' },
  { title: TOPICS[17], time: '6天' },
]

const groupView = []
groupView.push(chrome('groups'))
for (const group of groups) {
  groupView.push(groupHead(group.y, group))
  const guideTop = group.y + 16
  const rowsY = []
  group.rows.forEach((entry, index) => {
    const y = group.y + 36 + index * 33
    rowsY.push(y)
    groupView.push(row(y, entry))
  })
  const guideBottom = rowsY[rowsY.length - 1] + 14
  groupView.push(
    `<line x1="20" y1="${guideTop}" x2="20" y2="${guideBottom}" stroke="${group.color}" stroke-width="2" stroke-linecap="round" opacity="0.55"/>`,
  )
}
ungrouped.forEach((entry, index) => {
  groupView.push(row(396 + index * 33, entry))
})

writeFileSync(join(OUT, 'sidebar.svg'), svg(groupView.join('')))

// --- activity view ---------------------------------------------------------
const activity = []
activity.push(`<rect x="12" y="106" width="316" height="38" rx="10" fill="rgba(255,255,255,0.03)"/>`)
activity.push(`<text x="24" y="130" fill="${COLORS.text}" font-size="13.5" font-weight="600">活动</text>`)
activity.push(
  `<rect x="276" y="112" width="28" height="26" rx="7" fill="rgba(110,168,254,0.16)"/>` +
    `<g transform="translate(284 116)" stroke="${COLORS.accent}" fill="none" stroke-width="1.3">` +
    `<path d="M4 13h14l-2-3V7a5 5 0 0 0-10 0v3Z"/><path d="M9 15a2 2 0 0 0 4 0"/></g>` +
    `<circle cx="298" cy="115" r="2.6" fill="${COLORS.accent}"/>`,
)
activity.push(
  `<g transform="translate(308 114)" stroke="${COLORS.tertiary}" fill="none" stroke-width="1.3">` +
    `<path d="M10 2 5 7l3 3 5-5"/><path d="M5 7 2 11l3 3 4-3"/><path d="M6 13c2 .5 4 .5 6 0"/></g>`,
)

activity.push(`<text x="18" y="166" fill="${COLORS.tertiary}" font-size="11">优先级</text>`)
activity.push(row(190, { title: TOPICS[0], time: '', spinner: true }))
activity.push(row(223, { title: TOPICS[1], time: '', dot: true }))

activity.push(`<text x="18" y="266" fill="${COLORS.tertiary}" font-size="11">其他</text>`)
ungrouped.slice(2).forEach((entry, index) => {
  activity.push(row(292 + index * 33, entry))
})

writeFileSync(join(OUT, 'activity.svg'), svg(nav() + activity.join('')))

console.log('wrote docs/sidebar.svg and docs/activity.svg')
