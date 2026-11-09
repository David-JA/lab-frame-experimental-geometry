# Lab-Frame Experimental Geometry

基于实验室坐标系的实验装置几何与运动学可视化工具，面向单晶衍射实验的装置布局、嵌套运动与晶体方向表达。

本仓库用于承载独立的软件实现，包括装置层级、坐标变换、晶体方向计算和 Three.js 可视化。任务范围与验收由下列 Issue 持有，不在本仓库复制第二份任务台账。

## 任务关联

- [Obsidian #38：单晶衍射实验装置参数化运动学与晶体学三维可视化](https://github.com/David-JA/obsidian/issues/38) — 本工具的需求、G0/G1 验收及阶段状态入口。
- [Parent #32：可校准的单晶衍射虚拟实验平台](https://github.com/David-JA/obsidian/issues/32) — 本工具的上层项目；本工具独立交付，不作为 C0 虚拟采集的前置条件。

## 本地仓库

- 仓库名称：`lab-frame-experimental-geometry`
- 路径：`C:\coding_project\lab-frame-experimental-geometry`
- 初始分支：`main`
- 当前仅使用本地 Git，未配置远端，也未创建 PR。

## 当前状态

2026-11-10：已开始 G0/G1 开发，独立运动学、晶体方向与状态 API 已落地；当前页面仅为核心查询占位，可视化与浏览器验收仍在开发中。所有装配示例均为 synthetic，不能作为真实装置标定或安全控制依据。

## 本地开发

使用 Node 24（当前验证 24.17.0）和 npm（当前 11.13.0）：

```sh
npm ci --ignore-scripts
npm run typecheck
npm test -- --run
npm run build
npm run dev
```

默认只在 `127.0.0.1` 运行。示例在 `examples/experimental-setup/`，输入结构在 `schema/setup.schema.json`，纯计算入口为 `src/core/index.ts`。核心不依赖 Three.js、DOM 或 WebGL；UI 与渲染阶段将消费同一份场景状态。

2026-11-10 核心阶段：43 项数值/API 测试、类型检查及 scaffold 构建通过；浏览器与真实设备验证未完成。配置加载同时检查设备运动祖先、探测器固定、像素元数据和 LAB +Z 入射，允许合法的固定支架中间层。具体覆盖和剩余工作见 Spec。

## 开发方案

[G0/G1 最小实现与验收 Spec](./discuss/20261109_issue38_g0_g1_minimal_spec.md) 按 PWA Basic Spec 模板组织，明确计算核心、Three.js 页面、配置与 Agent 接口的开发顺序和验收方法，并回填实际验证范围。
