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

2026-11-10：已有可交互的本地三维初版。可调整 φ、六轴 XYZ/UVW、θ、XY、pivot 和晶体取向，显示晶向及中心/轴线读数，并导出、比较、恢复完整 JSON snapshot。所有装配示例均为 synthetic，不能作为真实装置标定或安全控制依据。

## 本地开发

使用 Node 24（当前验证 24.17.0）和 npm（当前 11.13.0）：

```sh
npm ci --ignore-scripts
npm run typecheck
npm test -- --run
npm run build
npm run dev
```

默认只在 `127.0.0.1` 运行；终端会给出本机地址，通常为 `http://127.0.0.1:5173`。示例在 `examples/experimental-setup/`，输入结构在 `schema/setup.schema.json`，纯计算入口为 `src/core/index.ts`。核心不依赖 Three.js、DOM 或 WebGL；UI 与渲染消费同一份场景状态。

## 当前验证与使用边界

- `npm run typecheck`、43 项独立数值/API 测试及 `npm run build` 通过。加载器检查设备运动祖先、探测器固定/像素元数据及 LAB +Z 入射，并允许合法的固定支架中间层。
- `npm run test:e2e`：在正常 Windows 用户边界使用已安装的 Edge headless / SwiftShader，三条浏览器闭环通过。测试自行启停 `127.0.0.1:4173`，无需预先运行 dev server；当前浏览器测试配置使用 `msedge` channel，其他系统需改用当地可用的浏览器。沙箱内的首次启动无输出，已中断并确认无遗留进程，不计为通过。
- 浏览器检查实际 Three.js 世界矩阵、视觉杆端点、C 正交轴原点和 detector 的 D 原点/有效平面；另以中心/目标点分离及 φ/θ 不共轴的配置核对读数。成功测试不等于真实设备校准或实验精度验证。
- 页面提供“全景”和“样品台近景”，φ/θ 轴有名称及颜色图例。距离读数明确区分样品中心和目标点；C 正交轴位于 C frame 原点，晶格方向示意箭头置于样品中心，目标方向置于目标点。primitive 的尺寸/`visual.offset_mm` 只作用于外观，不改变计算 frame。detector 有效区固定在 D 的 z=0，外壳尺寸另行显示。
- 真实设备参数、UVW 控制器映射、行程、标定及 G2 均未验证。初版未做网络服务、硬件控制或复杂 CAD；Three.js 单包构建约732 kB（gzip约190 kB），保留 Vite 的体积提示，尚未做按需拆包。

该初版供本地试用与后续验收；#38 的 G0/G1 尚未由用户正式接受。具体覆盖和剩余工作见 Spec。

## 开发方案

[G0/G1 最小实现与验收 Spec](./discuss/20261109_issue38_g0_g1_minimal_spec.md) 按 PWA Basic Spec 模板组织，明确计算核心、Three.js 页面、配置与 Agent 接口的开发顺序和验收方法，并回填实际验证范围。
