# dsh-task-groups

给 DSH 侧边栏加两件事：

1. **# 分组** —— 在“按工作区分类”之外，再用自己的分组整理任务（会话）。新建、重命名、换色、排序、折叠；把任务拖到分组标题上，或用行菜单移进去。
2. **活动铃铛** —— 一键查看正在运行 / 等待确认 / 未读的会话；点“清除已读”把它们移到下方“其他”，新活动会让对应会话重新回到优先级。

## 使用

- 顶部 `分组 | 项目` 切换分类方式：`项目` 就是 DSH 原本的工作区分组；选择会记住。
- 右侧铃铛进入活动视图（铃铛变成蓝色高亮），再点一次同一个铃铛就回到原来的列表；数字点表示有进行中或未读。
- 列表模式下 `⋯` 打开选项：搜索 / 新建分组 / 全部折叠 / 切换视图。
- 新建分组入口在 `⋯ → 新建分组`（右上角或分组 `⋯` 里）：点了只在最后一个分组下面临时出现一个名字输入框，回车创建、Esc 取消，平时不占位。分组视图是一个**扁平列表**：没有「未分组」分组头，未分组的任务就是普通行。
- **分组卡片可以拖到列表里的任何位置**，包括夹在两条未分组任务中间；拖动时卡片跟随鼠标居中，行与行之间会出现一条蓝色插入线标出落点，靠近列表顶/底会自动滚动，位置会记住（`order = 槽位 * 1000 + 组内序号`）。
- 双击分组名重命名；点分组卡片上的 `#` 色块打开「颜色 / 重命名 / 删除」菜单，当前颜色带勾选；`⋯`（或在分组标题上右键）是分组操作：编辑、全部标为已读、归档聊天（会先确认）、新建分组、删除分组。
- 拖动任务和拖动分组是同一套体验：浮起卡片跟手、行间出现蓝色插入线；拖进分组 = 加入该分组并落在那个位置，拖到分组外 = 移出分组。任务顺序会记在 `sessionOrder` 里（手动顺序优先，新会话仍排在最上面）。
- 分组里的任务左侧有一条**分组颜色的竖线**，一眼能看出哪些任务属于分组；空分组在竖线里显示虚线框「⊕ 新建任务，或拖拽到这里。」，点击也能新建。
- 每个分组右侧有 **⊕ 新建任务**：在当前（或最近）工作区新建一个任务并直接归入该分组。
- 任务行悬停时右侧出现 **置顶 / 归档** 两个按钮（运行中时归档置灰）；完整菜单用**右键**打开：重命名、置顶、标记为未读（本地标记，打开后清除）、分支（在新对话中从最后一轮分叉）、复制 ▸（工作目录 / 会话 ID）、移动到分组 ▸、归档。
- 活动视图：`优先级` = 运行中 / 待确认 / 未读；标题右侧铃铛位置固定，旁边是**扫帚图标**（悬停提示「清除已读」）。点进一个未读任务只是把它标成已读，**不会立刻掉到「其他」**，仍然留在优先级里；只有点扫帚才把已读的会话扫进 `其他`。
- 搜索：`⋯ → 搜索任务`，匹配任务标题、分组名、项目名。

## 安装

插件通过 `link:` 依赖 + `dsh.profile.bundles` 注册，`node_modules` 里放一个指向仓库的目录联接（junction）。
安装脚本会改 profile 的 `package.json`（改前自动备份），并支持任意 profile / DSH_HOME：

```powershell
node tools/enable-profile.mjs                      # 默认 desktop profile（DSH_HOME 或 ~/.dsh）
node tools/enable-profile.mjs --profile default    # 指定其他 profile
node tools/enable-profile.mjs --home D:\some\home  # 指定 DSH_HOME；干净的新 profile 也能装
node tools/enable-profile.mjs --remove             # 卸载（只删 junction 和清单项）
```

手工等价操作（不想跑脚本时）：

1. 在目标 profile 的 `package.json` 里加 `"dependencies": { "dsh-task-groups": "link:<仓库路径>" }`
2. 在 `dsh.profile.bundles` 里加 `"dsh-task-groups"`
3. 在 `<profile>/node_modules/` 下建一个指向仓库的 junction

装完**重启 DSH** 生效。开发时改 `lib/client.js` 会在约 0.5 秒内热替换（Host 的 client-hmr 会轮询 bundle 并推送 `rebuilt`）；只改前端也可用菜单 `应用 → 重新加载界面`。

### 依赖

- DSH 客户端 ≥ 0.2.1（用到 `sidebar.workspaces` 插槽、`Menu`/`MenuSurface`/`StateDot` 原语、`uiWorkspace.startSession/openSession/pinSession/archiveSession`、`remote.session.rename/fork`）
- 浏览器端无第三方依赖；Host 端只用 Node 内置模块

### 测试

```powershell
npm test          # jsdom 渲染测试（分组 / 拖拽 / 项目视图 / 活动 / 菜单）
npm run smoke     # Host 半侧冒烟：路由注册 + 状态读写 + 校验（临时 DSH_HOME）
```

## 数据

`%USERPROFILE%\.dsh\task-groups\state.json`：

```json
{
  "version": 1,
  "groups": [{ "id": "g…", "name": "api", "color": "blue", "collapsed": false, "order": 0 }],
  "assignments": { "session-…": "g…" },
  "sessionOrder": ["session-…", "session-…"],
  "prefs": { "view": "groups", "activity": false }
}
```

- 浏览器只持有内存状态，改动 350ms 防抖后 `PUT /dsh-task-groups/state`。
- Host 端按上限校验（200 个分组、5000 条映射、512 KB 请求体），再原子写入（临时文件 + rename）。
- 之所以不存 localStorage：桌面端每次启动的 Web 端口会变，origin 跟着变，localStorage 会丢；这个文件不会。

## 实现

- Host `lib/index.js`：`webServer.register({ kind: 'prefix', path: '/dsh-task-groups' })`，提供 `GET/PUT /state` 与 `GET /health`。
- Client `lib/client.js`：以 `priority: -1` 抢注 `sidebar.workspaces` 单槽。ui-workspace 的原生浏览器仍在槽里（priority 0），本插件渲染失败时槽监督会让它自动回退，所以坏掉也不会把侧边栏弄没。
- 数据来源：`useSessions`（会话目录）、`useWorkspaces`（工作区、归档、置顶）、`useSessionStatus`（运行中 / 待确认 / 未读完成）；打开会话走 `ctx.uiWorkspace.openSession`，归档/置顶走 `ctx.uiWorkspace.archiveSession/pinSession`。
- 选中态通过 DOM 的 `[data-conversation-session]` 读取，并用 `MutationObserver` 跟随。

## 测试

`test/render.test.mjs` 在 jsdom 里用假的 primitives / hooks 渲染整个侧栏区域，覆盖分组、未分组、子代理过滤、活动优先级与“清除已读”：

```powershell
npm test
```

它从本机的 `dsh-more-details` 检出里借 React 与 jsdom；路径不同就用 `DSH_DEV_CHECKOUT=<path>\package.json` 覆盖。

## 限制

- 搜索只覆盖标题 / 分组名 / 项目名，不检索消息正文。
- 拖拽是原生 HTML5 DnD，只对鼠标生效；没有拖拽时用行菜单移动。
- 分组数据是“每个 DSH home 一份”，不跟会话走，也不会同步到别的机器。
- “清除已读”只改活动列表的排序状态，不动会话本身；新的运行 / 未读会让它重新出现。
- 侧边栏折叠成 56px 图标栏时只保留铃铛和“展开列表”两个入口。
