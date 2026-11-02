# dsh-task-groups

> 中文 | [English](README.en.md)

给 DeepSeek Harness 侧边栏加两件事：**自定义分组** 和 **活动铃铛**。

![分组视图](docs/sidebar.svg)

## 功能

- **自定义分组**：分组卡片可以拖到列表任何位置，也能夹在未分组任务之间；`#` 换色、`⋯` 编辑/全部已读/归档/删除，`⊕` 在组内新建任务。
- **活动铃铛**：一眼看到运行中 / 待确认 / 未读的会话；点进未读不会立刻掉队，点**扫帚**才把已读的扫进「其他」。
- **项目视图**：保留 DSH 原生的按工作区分组、每条工作区 5 条水位和「显示更多」。
- **拖拽排序**：任务和分组同一套体验——浮起卡片、行间蓝色插入线、自动滚动；拖进分组即归组，拖到组外即移出。
- **右键菜单**：重命名、置顶、标记未读、分支、复制工作目录 / 会话 ID、移动到分组、归档。

![活动视图](docs/activity.svg)

## 安装

```powershell
git clone https://github.com/spike237/dsh-task-groups.git
cd dsh-task-groups
node tools/enable-profile.mjs
```

默认装进 `desktop` profile；其他 profile 用 `--profile <name>`，干净环境用 `--home <DSH_HOME>`。装完**重启 DSH**。

卸载：`node tools/enable-profile.mjs --remove`

## 使用

| 位置 | 操作 |
| --- | --- |
| 顶部 `分组 \| 项目` | 切换分类方式 |
| 铃铛 | 活动视图；再点一次返回 |
| 分组 `#` | 颜色 / 重命名 / 删除 |
| 分组 `⋯` | 编辑、全部标为已读、归档聊天（先确认）、新建分组、删除 |
| 分组 `⊕` | 在该分组新建任务 |
| 任务行悬停 | 置顶 / 归档 |
| 任务行右键 | 完整菜单 |
| 空白处 / 组外拖动 | 移出分组 |

## 数据

`$DSH_HOME/task-groups/state.json`

```json
{
  "version": 1,
  "groups": [{ "id": "g…", "name": "api", "color": "blue", "collapsed": false, "order": 0 }],
  "assignments": { "session-…": "g…" },
  "sessionOrder": ["session-…"],
  "prefs": { "view": "groups", "activity": false }
}
```

由 Host 端校验并原子写入；浏览器只持有内存状态，改动 350ms 防抖后 `PUT /dsh-task-groups/state`。

## 测试

```powershell
npm test       # jsdom 渲染：分组 / 拖拽 / 项目视图 / 活动 / 菜单
npm run smoke  # Host：路由注册、状态读写、校验
```

## 许可

[MIT](LICENSE)
