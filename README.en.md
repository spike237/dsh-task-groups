<div align="center">

# 🗂️ DSH Task Groups

**Organize your tasks. Keep active conversations in sight.**

Custom task groups and an activity bell for the DeepSeek Harness sidebar.

[![DSH Plugin](docs/badges/dsh.svg)](package.json)
[![Node.js](docs/badges/node.svg)](package.json)
[![License: MIT](docs/badges/license.svg)](LICENSE)

[中文](README.md) · **English**

[Preview](#preview) · [Install](#install) · [Usage](#usage) · [Report an issue](https://github.com/spike237/dsh-task-groups/issues)

</div>

<a id="preview"></a>

## ✨ Two small additions to your sidebar

Group conversations the way you work, then check the bell when several tasks are active at once.

<table>
  <tr>
    <th width="50%">🗂️ Task groups</th>
    <th width="50%">🔔 Activity bell</th>
  </tr>
  <tr>
    <td align="center" valign="top">
      <p>Group by topic. Drag to arrange.</p>
      <a href="docs/images/groups.png"><img src="docs/images/groups.png" width="380" alt="Group view with color-coded plugin and documentation groups and their tasks."></a>
    </td>
    <td align="center" valign="top">
      <p>Find running, waiting and unread conversations.</p>
      <a href="docs/images/activity.png"><img src="docs/images/activity.png" width="380" alt="Activity view with priority conversations at the top and other conversations below."></a>
    </td>
  </tr>
</table>

### 🗂️ Organize tasks your way

- **Custom groups:** name, color, collapse and expand groups of related conversations.
- **Drag to organize:** reorder tasks and groups, move tasks into or out of a group, and place groups between ungrouped tasks.
- **Group actions:** start a task inside a group, mark its conversations as read, or archive them in bulk.
- **Project view:** switch back to workspace-based browsing, with “Show more” to expand the task list.

<details>
<summary>📁 See the project view</summary>

<p align="center">
  <a href="docs/images/projects.png"><img src="docs/images/projects.png" width="420" alt="Project view with demo-app and docs workspaces, Show more, and an ungrouped section."></a>
</p>

</details>

### 🔔 Keep important activity in sight

Click the bell to open the activity panel. **Running conversations, pending confirmations and unread conversations** appear under “Priority” (优先级); the rest appear under “Others” (其他).

Opening an unread conversation keeps it in the priority list so you can return to it. When you are done, click the **broom** to move eligible conversations to “Others”; running conversations and pending confirmations stay in place. Click the bell again to return to your task list.

<a id="install"></a>

## 🚀 Install

You need an existing **DeepSeek Harness** installation that has been launched at least once, **Git**, and **Node.js 20.11+**. For the default `desktop` profile on Windows:

```powershell
git clone https://github.com/spike237/dsh-task-groups.git
cd dsh-task-groups
node tools/enable-profile.mjs
```

Or install from npm (requires DSH 0.2.1+):

```powershell
dsh plugin --profile desktop add dsh-task-groups
```

**Restart DSH.** The sidebar will show the “Groups / Projects” toggle and the bell.

> [!NOTE]
> The installer backs up and updates an existing profile configuration, then links the plugin to this checkout. Keep the repository directory in place; moving it requires updating the link.

<details>
<summary>Other profiles, custom paths and uninstalling</summary>

Choose an existing profile:

```powershell
node tools/enable-profile.mjs --profile my-profile
```

Choose a DSH data directory that already contains the corresponding `profiles/<name>/package.json`:

```powershell
node tools/enable-profile.mjs --home "D:\DSH" --profile desktop
```

Without `--home`, the installer uses `DSH_HOME` if set, otherwise `%USERPROFILE%\.dsh`.

To uninstall from the default profile, run this command and restart DSH:

```powershell
node tools/enable-profile.mjs --remove
```

If you installed with `--home` or `--profile`, use the same arguments when uninstalling. Uninstalling removes the plugin configuration and directory link, while keeping saved group data.

</details>

<a id="usage"></a>

## 🧭 Usage

Right-click a group to open its menu, choose **New group (新建分组)**, then drag related tasks into it.

| Action | How |
| --- | --- |
| Create a group | Right-click a group → New group, or use the top `⋯` menu |
| Switch views | Click “Groups / Projects” (分组 / 项目) |
| Rename or recolor a group | Click its colored `#` icon |
| Start a task in a group | Click the group’s `⊕` button |
| Reorder or move tasks | Drag a task or group and follow the insertion line |
| Check activity | Click the bell; click again to go back |
| Clear the activity list | Click the broom in the activity panel |
| Search tasks | Top `⋯` → Search tasks (搜索任务) |
| More task actions | Right-click to rename, pin, mark unread, branch, move to a group or archive |

Deleting a group removes its assignments and keeps its tasks. Right-click a group to edit it, mark all its conversations as read, or archive them in bulk.

## 🛠️ Development and data

Groups, task assignments, ordering and view preferences are saved to `$DSH_HOME/task-groups/state.json`, or `.dsh` under your home directory when `DSH_HOME` is unset. The Host validates and writes state atomically so it survives restarts.

<details>
<summary>Run checks</summary>

Host state persistence and validation:

```powershell
npm run smoke
```

UI checks need a development environment with `react`, `react-dom` and `jsdom` installed. Point `DSH_DEV_CHECKOUT` to that environment’s `package.json`:

```powershell
$env:DSH_DEV_CHECKOUT = "D:\path\to\dev-project\package.json"
npm test
```

Covers groups, drag and drop, project view, activity and menus.

</details>

## 📄 License

[MIT](LICENSE)
