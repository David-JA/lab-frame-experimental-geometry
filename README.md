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

2026-11-09：完成本地 Git 初始化及 README，并确定项目名称为 Lab-Frame Experimental Geometry，尚未开始功能实现。

当前没有应用源码、依赖清单、运行入口或测试程序，无需安装依赖。后续实现及验证以 Obsidian #38 的合同为准；初始化不代表 G0/G1 完成或设备运动学得到验证。

## 开发方案

[G0/G1 最小实现与验收 Spec](./discuss/20261109_issue38_g0_g1_minimal_spec.md) 按 PWA Basic Spec 模板组织，明确计算核心、Three.js 页面、配置与 Agent 接口的开发顺序和验收方法。当前处于设计阶段，尚未开始功能实现；文中的安装、启动和测试命令均为后续计划。
