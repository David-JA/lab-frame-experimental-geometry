# Codex handoff：实验几何工作台首轮改版

日期：2026-11-10
状态：**T8 参考图配色/结构/高度优化已验证并经主 Agent/Astra high 视觉检查，通过后按用户授权随本次本地提交保存，5173 服务保留。**

T8：黄色 `#F8E68A` 方柱（高度为外观尺寸，顶面固定）、大小银色圆盘、上下黑色方转接板（H1/H0）、6 视觉支杆、金属色 XYθ、棕色样品。H1 Y=142.5、P0 Y=57.5 配套保持样品/pivot/beam/detector 原 y=200；零位接触和高度仅影响visual配置已验证。87 tests、typecheck/build、8 E2E 通过，主 Agent 与 Astra 对照参考图及 `artifacts/appearance-*.png` 检查，Astra PASS 无 blocker。全部已审源码/示例/测试与状态文档一起提交（由 Git log 定位本次提交），不改核心算法/Schema/依赖；仍不推送、不建 PR。默认装置近景，原全景与样品近景保留。

T7：装置说明置底、专属说明贴近块；标签保留合法跨帧相对位置与亚像素精度，修复左右换边及慢速滞后。内容/视觉两位均 PASS；文字审阅意见已落实并由主 Agent 核对。最终 86 tests、typecheck/build、7 E2E（31.2 s）通过；截图在 `artifacts/description-footer-final.png`。本次用户明确授权覆盖 T7“不自动提交”的限制，全部已审源码、测试和状态文档一起本地提交（由 Git log 定位）；核心/Schema/示例/依赖未改。保留现有 5173 服务，不推送、不建 PR；后续视觉优化属于下一项修改。

此前 T6 历史：用户在两轮双 review 通过后授权将已审改动一起本地提交，已落实为 `dc449b1`，并启动 5173 评审服务。原“暂停/不自动提交”只被该次明确授权覆盖；当前 T7 不自动提交，仍不推送、不建 PR。T6a–T6f 的原验证为 83 tests（58 核心＋25 展示）、typecheck/build、7 E2E；不等于 G0/G1 正式接受。当前权威任务状态见 [Spec](./20261109_issue38_g0_g1_minimal_spec.md#tasks)，以下暂停交接内容仍保留历史含义。

评审预览使用仓库内 `npm run dev -- --port 5173 --strictPort`，仅监听 `127.0.0.1`；若端口被其他服务占用则另选空闲端口，不接管或停止其他服务。运行入口以任务回复给出的实测 URL 为准，服务运行状态不作为永久验收记录。

## 1. 原暂停交接点（以下为历史）

仓库：`C:\coding_project\lab-frame-experimental-geometry`，分支 `main`。

用户上一轮明确确认了两个操作：

1. 将此前全部已验证修改一起提交，而不是只提交旧暂存区。
2. 随后直接落实 web agent 评审的首轮四项：工作区重排、默认标签减负、装置树/选中联动、视觉层级；**不改运动学、不改 snapshot 格式、不重构 Agent 接口、不做完整 CAD**。

第一步已完成：

```text
d149f90 feat: refine geometry controls and integrate the XYtheta stage
```

该提交包含此前日间/分层控件、晶体 frame 注册顺序修复、坐标标注修正、XYθ 一体台及相关回归。提交之后曾确认工作区干净。本轮工作台改版是此提交之后的新修改，**全部仍未暂存、未提交**。

用户现在因 Codex 限额恢复要求暂停、写 handoff。父代理已停止实现；实现子代理也已确认停止、保持 idle。临时 Vite `4174` 服务已关闭；检查 `4173/4174` 均没有本轮验证服务残留。本轮尚未创建用于工作台改版的 Tabbit 浏览页，因此没有该轮待关闭的浏览器任务。

## 2. 用户需求与不能回退的既有约束

### 本轮视觉/信息组织要求

- 约 1062 px 宽度采用左侧约 240–280 px 的装置树/当前设备参数，其余主要留给三维视口。
- JSON 编辑、导入导出、配置比较、详细读数、继承诊断应按需打开，不默认常驻。
- 关键读数靠近视口：带轴误差、目标点到 φ 轴距离、样品中心到 θ 轴距离。
- 默认只保留目标晶向/法向、目标点、当前选择及必要旋转轴；全部局部 frame、C/晶格等放入坐标诊断。
- 普通轴名不应全是白底大卡片；共点只用简短提示，展开后再列成员与方向。
- **真实三维共点才可归并，屏幕投影重叠只能避让。C 正交轴与直接晶格不能在语义上合并。**
- 装置树与三维选择/参数面板对应；运动参数优先，安装与几何默认折叠。
- 相机操作与恢复装置状态分开；合成/未标定身份与操作成功提示分开。
- 保留轻量模型，调整相机、材质、网格和选中表现，不能偷偷改设备尺寸、间距或轴位置。

### 之前已确认的 XYθ 约束

用户通过澄清表单选择的是：**合成一张 XYθ 卡片，XY 基座固定于 θ 中心，仍保留 θ 旋转及 X/Y 内部行程**，不是取消 X/Y 行程。

基线已通过 `xy.integrated_into="theta"` 表达一体关系，加载器检查零行程基座与实际 θ 轴中心重合，包括固定垫片链。未声明一体关系的旧配置仍保留独立装配。当前改版只是将这张卡片改为树中的一个节点和单个检查器，不能破坏该约束。

`LAB +Y` 向上、`+Z` 入射、θ→XY 内部运动顺序、S/C 区分、真实晶向/倒易法向区别均保持。所有示例仍为合成/未实物标定；G0/G1 尚未由用户正式接受。

## 3. 工作区变化与实现位置

暂停时以下内容相对 `d149f90` 修改：

| 文件 | 本轮内容 |
|---|---|
| [src/main.ts](../src/main.ts) | 中文工作台标题；两栏工作区；底部三项关键读数与目标方向摘要；原 JSON/详细读数/诊断移入原生 dialog 抽屉；共点详情；选择/诊断开关连接 viewer |
| [src/style.css](../src/style.css) | 270 px 侧栏（宽屏 280 px）、视口填充剩余高度；中性正文/分隔；树/单检查器；轻量标签；抽屉；窄屏 sticky 视口与参数区 |
| [src/ui/device-controls.ts](../src/ui/device-controls.ts) | 真实父子树、键盘导航与选中行；一次显示一个设备检查器；运动置前、安装默认折叠；XYθ 合并关系保留 |
| [src/viewer/viewer.ts](../src/viewer/viewer.ts) | 展示模式、选择联动/实体拾取、常规/诊断图层、实体材质、相机预设与取景；最新一次选中边线调整也在这里 |
| [src/viewer/scene-labels.ts](../src/viewer/scene-labels.ts) | 轻量标签/强调标签；短共点按钮及回调；真实锚点元数据保留；侧向摆放与样品附近留白 |
| [src/viewer/view-policy.ts](../src/viewer/view-policy.ts) | **新增、未跟踪**的展示策略/相机等 viewer-only helper |
| [tests/browser/workflows.spec.ts](../tests/browser/workflows.spec.ts) | 原六条流程适配树/抽屉；第七条工作台流程；常规/诊断模式、共点详情、快读数等检查 |
| [tests/labels.test.ts](../tests/labels.test.ts) | 原五项布局测试扩展为 23 项布局/展示策略/取景测试 |

`src/core`、`schema`、`examples`、依赖清单/锁文件相对 `d149f90` **没有修改**。没有安装依赖、改动状态格式或提交本轮改版。

### UI/渲染接线合同

```typescript
new GeometryViewer(container, {
  onSelect: (deviceId) => deviceControls.select(deviceId),
  onInspectCoincident: (worldPosition) => showCoincident(worldPosition),
});
viewer.set_view({ selectedDeviceId, diagnostics });
```

- `set_view` 是展示层方法，复用缓存的 Scene，不修改 scene revision/snapshot。
- `DeviceControls` 支持 `selectedId`、`select(id)`、`setExpanded(boolean)`；XY 子设备 id 会解析到其一体台宿主。
- 默认选择一体台宿主，通常为 `theta`。其他设备由树或三维实体点击选择；拖动 OrbitControls 不应误选。
- `diagnostics().selected_device_id` 反映选择。
- `diagnostics().diagnostic_layers` 是 **对象**，例如 `{enabled, frames, crystal, lattice}`，不是布尔值。浏览器断言已经修正为读取 `.enabled`。
- 本地诊断总开关、相机、选择不进入 snapshot。旧 `display.frames/crystal/lattice` 字段保留，诊断模式内继续使用。
- `#readout` / `#diagnostics` 仍保留 DOM 与原数值/状态数据属性，但已移至默认关闭的抽屉；不能再按旧界面假设它们默认可见。

### 标签与共点

- 常规模式的目标点/目标方向与必要 φ/θ 轴可见，不常驻所有 frame/C/晶格标签。
- DOM hooks：`data-emphasis="plain|selected|coincident"`、`data-selected`、layer `data-diagnostics`。
- `.scene-label-inspect[data-action="inspect-coincident"]` 打开共点详情。
- `data-members`、`data-world` 元数据保留，不能只看短标签文字推断成员被删除。
- 详情通过核心查询重新列出真实共点的 frame 原点、样品中心、目标点、pivot；frame 的 LAB X/Y/Z 方向逐一列出，明确共点不等于同向。
- 已修正近景下目标方向 caption 被裁出画面的问题：取景包含主目标方向 tip/文字余量，但不受长辅助轴撑大。
- 已修正短共点标签横跨样品圆柱的问题：优先左右侧放置，保留短引线和中心留白；边缘受限时才上下回退。相关单测已加入。

## 4. 最后一次改动：必须注意验证时间边界

**暂停前最后一轮只改了 viewer 的选中实体边线：**

- 选中实体边线：深蓝 `#155b91`，opacity `1`。
- 未选中及后代边线：中性颜色，opacity `0.24`，不把所有后代同样高亮。
- 没有改变几何尺寸、位置或真实坐标。

子代理已确认该改动写入并停止。该轮只执行了 `npm run typecheck` 及该文件的 `git diff --check`，均通过。

**下面的 81 项测试、七条浏览器流程、生产构建和截图，均是在这次最后的选中边线强化之前完成。** 不要将其误报成对最后一行边线变更也做了完整视觉复验。最新边线尚待浏览器截图/实体选择视觉复核；`dist` 也需要按最终源码重新构建。

## 5. 已有验证与证据

最后一次完整运行（2026-11-10 约 13:18，本机时间）：

| 验证 | 结果 |
|---|---|
| `npm test -- --run` | 81 passed：58 核心数值/API + 23 布局/展示策略 |
| `npm run build` | typecheck 和 Vite build 通过 |
| `npm run test:e2e` | 7 passed |
| 核心/Schema/示例/依赖 diff | 相对基线为空 |

构建主 JS 约 764.88 kB / gzip 201.44 kB；Vite 单包体积告警仍在，非新发现的功能失败，未通过改阈值隐藏。

七条浏览器流程保留：偏心→对中→嵌套 θ / 实际 Three.js 矩阵；晶体倾转→φ / 反平行；安装继承及非法输入；导出→比较→恢复 / 原子拒绝；稀疏标签及显式诊断；XYθ 一体台；新增工作台布局/选择/读数/抽屉/窄屏。

新增工作台断言包括：1062×956 下侧栏 240–280 px、视口宽 >700 px 且高 >600 px、无纵向功能页溢出；默认 JSON 不可见、只有当前检查器、安装折叠；选择和诊断总开关不改 snapshot；三项快读数；窄屏无横向溢出且滚到参数时视口仍可见。既有物理世界矩阵、杆端点、C 原点、detector 平面误差检查保留。

截图（ignored `artifacts`，可以由测试重建）：

- [workbench-1062.png](../artifacts/workbench-1062.png)：默认近景，树＋XYθ 运动输入，底部快读数。
- [workbench-overview.png](../artifacts/workbench-overview.png)：全景和探测器/样品/光束关系。
- [workbench-mobile.png](../artifacts/workbench-mobile.png)：390×844，示例已改 `xy.x=1`，因此两个相关距离为 1 mm 是预期。
- [labels-closeup-1062.png](../artifacts/labels-closeup-1062.png)、[labels-tilted.png](../artifacts/labels-tilted.png)、[labels-mobile.png](../artifacts/labels-mobile.png)。

上述主要工作台截图拍于 13:18:51–52 左右，是**选中边线强化前**的画面。已人工看过布局、默认标签与共点侧放；本轮还没在真实 Tabbit 页面完成最终实体拾取/强化边线检查。用户暂停时只启动了临时预览，随后已停止。

## 6. 推荐的接手顺序（不是要求现在继续）

1. 先看 `git status` 和本文件，确认 `d149f90` 已提交，保留所有新工作区修改，尤其不要遗漏未跟踪的 `src/viewer/view-policy.ts`。
2. 优先视觉核对**最后的选中边线强化**：选中 XYθ、hexapod、φ；确认主体有明确强调、后代不抢同等权重；检查三维点击可选择、旋转拖动不误选。
3. 最终构建/回归，更新截图；必要时只针对实际缺口修正，不回退为默认展示所有诊断标签。
4. 同步 [README](../README.md) 与 [Spec](./20261109_issue38_g0_g1_minimal_spec.md)。**它们目前仍是已提交的旧布局说明/旧测试计数，本轮尚未更新**：旧文档中的六条浏览器、五项标注单测、约 750 kB 是基线状态，不是当前工作台状态。
5. 形成首轮评审回应，可按“工作区/标签/树与选中/材质与取景”四项逐条说明。剩余视觉打磨与正式 G0/G1 用户接受应分开，不自动勾完 T6。
6. 本轮改版未经用户要求再次提交；不要因先前“先提交这个版本”自动提交新改版。

验证命令（已安装依赖，不需先重装）：

```powershell
npm run typecheck
npm test -- --run
npm run build
$env:NO_PROXY = if ($env:NO_PROXY) { "$env:NO_PROXY,127.0.0.1,localhost,::1" } else { '127.0.0.1,localhost,::1' }
npm run test:e2e
```

本机 `HTTP_PROXY/HTTPS_PROXY` 为 `socks5:`。不为 loopback 设置 `NO_PROXY` 时 Playwright 本地服务就绪检查会报协议不支持；这里只临时追加本进程环境，不修改持久代理设置。E2E 用已安装 Edge headless/SwiftShader，自己启停 `4173`。若临时人工预览另用 `4174`，使用 strictPort，验证后只停自己的进程。

## 7. 停止边界

- 已暂停源代码实现与测试运行，只整理此 handoff。
- 实现子代理已停止，最近选中边线改动保留，未回退。
- 本轮修改与此 handoff 都不暂存、不提交、不推送。
- 不改硬件、安全控制、真实标定或 G2；不新增远端/PR。
