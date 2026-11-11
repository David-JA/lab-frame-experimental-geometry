# Obsidian #38：G0/G1 最小实现方案与验收 Spec

Status: Done — G0/G1 已由 Maintainer 正式接受，已归档
Delivery status: Merge Ready — 实现已在 main 发布，无待合并 PR；本次登记不执行新 merge
Accepted: 2026-11-11
Accepted implementation: `c3e448002e02ac4bc596af7cb46c839fcd049918`
Archived from: `discuss/20261109_issue38_g0_g1_minimal_spec.md`
Issue: [Obsidian #38](https://github.com/David-JA/obsidian/issues/38)
Created: 2026-11-09
Decision owner: Maintainer
Current phase: T1–T20已交付；Maintainer确认五组网页验收全部通过，G0 8项/G1 12项正式接受，T6闭合。#38登记Merge Ready并保持Open，G2不勾选；实物复测与扩展由#2/#3持有

## Goal and scope

为 Lab-Frame Experimental Geometry 建立可直接指导 G0/G1 开发的最小合同：在统一 LAB 坐标系中，以参数驱动真实的装配层级，计算设备位姿与晶体方向，并通过本地 Three.js 页面和程序接口消费同一份状态。

2026-11-09 完成 Spec 与 README 导航；2026-11-10 获用户明确授权，开始按本合同推进本地实现。实施结果仅在 Tasks/Outcome 回填；设计评审通过不等于 #38 的实现验收。

2026-11-10 接手审计后，用户明确授权先更新本合同并经 Astra high 审阅，通过后继续收尾；内容与视觉效果须由 Astra high、Terra xhigh 独立完成两轮 review。本轮沿用已实现的工作台，不重做核心或扩张 G2；用户接受、Git 提交与实现验证分别处理。

首期包含固定装配、φ、六轴 XYZ/UVW、θ→XY、样品/晶体、独立探测器和光束、配置加载、状态保存恢复与比较、基础查询及界面。G2 的衍射交点、运动序列回放、交互拾取测量、更多设备导入，以及自动对准、硬件控制、真实支链求解均不纳入。

2026-11-11 用户追加的实时单晶衍射预览由[独立 Spec](./20261111_diffraction_preview_spec.md)承接。它复用本合同的 Scene/坐标与晶格，不改变本合同的 G0/G1 正式验收，也不表示原 G2 范围整体启动。

## Current evidence

- 设计时的本地源码基线仅含 README；仓库独立、无远端、无 PR，没有可复用的本项目运动学实现。
- T6接手基线为 `d149f90`，包含核心、日间控件、坐标标注及 XYθ 一体台。其后工作台改版、验证和状态文档已随 `dc449b1` 保存，当时 `src/core`、Schema、示例和依赖相对该基线未变；T9新增的核心/Schema变更另见下方。旧handoff已按用户要求删除，历史交接可从Git查阅，本Spec保留有效验证边界。
- 接手审计与 Astra high 定向核查当时未发现已确认的功能 blocker；接手时主要缺口为最后选中边线的视觉证据、真实浏览器拾取/拖动闭环及文档同步，现已由 T6c/T6d 补齐。历史 81 项测试和 7 条 E2E 不直接作为最后边线修改后的复验结果。
- #38 已明确 `LAB→R→H0→H1→P0→P1(θ)→P2(XY)→S→C`；θ 在下、XY 在上由用户最终确认，不再作为待选方案。
- #38 要求 `+Y_lab` 向上、`+Z_lab` 入射、右手系、列向量变换；hexapod 变换须包含零位安装 `T0`。C 是正交笛卡尔 frame，直接晶格基矢 A 不必正交。
- 设计时实物参数尚未提供；T9收到卷尺安装高度，T10收到六轴尺寸图及总高更正，来源与当前尺寸见[高度记录](../../discuss/20261110_lab_height_survey.md)。完整安装pose、控制器UVW映射、认证行程及晶体取向文件仍缺，本Spec不宣称真实装置校准或运动可执行性。
- PWA的[Spec workflow](https://github.com/David-JA/single-crystal-stress/blob/350f3cd5661a90fb0a00c7f50286a7b856892e99/docs/workflows/discuss_spec_workflow.md)与[Basic模板](https://github.com/David-JA/single-crystal-stress/blob/350f3cd5661a90fb0a00c7f50286a7b856892e99/docs/workflows/spec_template_basic.md)作为结构参考，读取版本为350f3cd5661a90fb0a00c7f50286a7b856892e99。选择Basic单文件：本阶段属于一个有界交付，不复制PWA的多PR/正式运行合同。
- 不将 PWA 的材料 baseline、数据目录、双语全套文档或 PR/merge 流程复制到新仓库；这里只采用“先稳定合同、再列方案/任务/验证”的组织方式。PWA 生成器固定其仓库根，因此按模板在本仓撰写，不调用它向 PWA 写文件。

## Required deliverables

**当前交付状态：** 装配、运动学、晶体学、保存恢复、工作台与交互改进已实现并完成工程核查；新增衍射预览由[独立Spec](./20261111_diffraction_preview_spec.md)持有。2026-11-11用户逐组确认：前三项已测试通过、第五项通过，保存恢复也已测试，明确“都通过”并授权登记、同步和归档。G0/G1正式接受，T6闭合，交付状态Merge Ready；旧段落中的待接受/不勾选说明保留其历史时点。本地5173服务继续保留。

**后续 G0/G1 实施：**

| 交付 | 最小内容与消费者 |
|---|---|
| 独立计算核心 | 配置、frame 图、刚体变换、晶体方向、几何量与两状态比较；Node 测试和本地 Agent 接口直接调用 |
| 可移植配置 | `examples/experimental-setup/{devices,assembly,experiment_state}.json` 与 `schema/setup.schema.json`；页面和无渲染测试读取同一组输入 |
| 合成示例 | 一个理想对中配置、运行时可构造的偏心/倾转状态，以及一个非正交晶格用例；均明确 hypothesis 身份 |
| 本地页面 | 简化装置、参数输入、坐标/晶向显示、几何读数、JSON 导入导出、状态比较摘要及相机操作 |
| 验证入口 | 数值测试、配置/API 测试、少量浏览器闭环检查、typecheck/build；README 写实际可执行命令和边界 |

不新增通用 CAD 框架、插件系统、数据库、网络 API、Python 第二套运动学或完整仪器数据导入。

## Non-negotiable constraints

1. #38 持有任务需求、验收和动态状态；本文只投影其 G0/G1 实现合同。冲突时先核对 #38，不自行削减要求或增加科学主张。
2. 计算核心不能 import Three.js、DOM 或 WebGL。配置和状态是权威来源；渲染对象只消费结果。
3. frame 只有刚体 pose，禁止把视觉尺寸缩放混入坐标变换。伸缩杆只连接端点，不反算/约束平台。
4. φ 轴固定在 LAB；H0 不继承 H1 倾转；θ 的父级为 P0，XY 的父级为 θ 输出 P1。探测器和 beam 固定于 LAB。
5. 输入/输出显式携带坐标系与单位；机械 mm、晶格 Å、外部角度 deg。直接方向与倒易方向分开，不把晶格基底当正交 frame。
6. 示例所有机械尺寸、cell、取向和行程均标为 `hypothesis / synthetic`。探测器 4288²、0.1 mm 来自 Issue 声明，身份是 `source_statement`，不是本仓实测规格。
7. 早期仅本地Git阶段由T11明确公开发布授权替代；现在保留本地历史并推送个人公开仓库main，Pages自动部署，不建PR。既有loopback评审服务保留，授权不扩张到真实仪器或G2。

## Evidence basis

- [#38](https://github.com/David-JA/obsidian/issues/38)：需求真值，读取快照 updatedAt=`2026-11-09T15:13:31Z`；设备层级来自用户陈述，科学真实性仍需实际证据。
- [Parent #32](https://github.com/David-JA/obsidian/issues/32)：共享能力与独立交付边界；本工具不成为 C0 前置。
- [#67](https://github.com/David-JA/single-crystal-stress/issues/67)：既有几何合同的方向线索，非本工具已通过验证的证据。个人库 [Ewald 几何笔记](https://github.com/David-JA/obsidian/blob/master/20_Notes/Concepts/Ewald%E7%90%83%E4%B8%8EQ-space%E5%87%A0%E4%BD%95.md) 用于定位相同的 +Z 入射、+Y 向上约定。
- [Three.js Matrix4](https://threejs.org/docs/pages/Matrix4.html)：渲染适配的矩阵存储约定；[Vite](https://vite.dev/guide/)、[Vitest](https://vitest.dev/guide/)、[Ajv](https://ajv.js.org/guide/getting-started.html)：工具用途与配置线索，不是已安装版本或兼容性验收。
- [IUCr orientation matrix](https://dictionary.iucr.org/Orientation_matrix)：直接/倒易基底与正交晶体 frame 的区分线索。下列预期数值由解析推导给出，属于 `calculation`，需由未来实现独立检验。

## Acceptance boundary

**Spec 交付：** 既定需求能追踪到模块、开发任务和验收用例；关键坐标与输入输出无待猜语义；Astra high / Terra xhigh 完成独立设计审阅，范围内 finding 得到处置；README 导航与实际文档一致。本轮不勾选后续实施任务，不更新 #38 的实现验收状态。

**G0 阶段：** V01–V04、V09 的装配/Schema 部分及 V12 的静态页面部分通过；能配置并显示正确装配，外层 φ 的数值与画面联动，其他设备有正确零位和 frame。G0 允许晶向交互与其余运动尚未交付，报告必须说明有限范围。

**G1 阶段：** 下表全部用例及构建/类型检查通过，用户可以完成偏心→XY 对中→θ 旋转、晶向调整→φ 扫描、状态导出→修改→比较→恢复三条闭环。图像看起来合理、同一生产 helper 自我比较、成功 build 或同模型回收均不能单独作为数值正确性/设备真实性证明。G2 不阻塞此阶段。

| #38 验收组 | 本 Spec 承接 |
|---|---|
| G0：LAB、真实父子关系、φ 整体运动、探测器/beam 独立 | 5.2–5.3；T2/T4；V01/V02/V04/V12 |
| G0：双平面/视觉杆、θ→XY、S/C 分离、可配置安装 | 5.1–5.5；T2/T4；V03/V04/V06/V09/V12 |
| G1：φ、XYZ/UVW/pivot、θ、XY 对中与多中心偏差 | 5.2–5.3/5.6；T2/T5；V02–V05/V08 |
| G1：cell/取向、晶轴/指定方向、父级运动与带轴几何 | 5.4/5.6；T3/T5；V06–V08 |
| G1：保存恢复与比较、Agent 基础接口、Three.js 与计算一致 | 5.5–5.7；T3/T5/T6；V09–V13 |

表中 5.x 指下方 Proposed approach 的相应小节；它不是引用 PWA 的章节编号。

## Proposed approach

### 5.1 技术选型、模块边界与留存

**Decision: 单一 TypeScript 实现，计算与渲染分离。**
- Selected: 一个 npm 项目；TypeScript + Vite + Three.js，原生 HTML 表单，不引入 UI 框架。Ajv 检查 JSON Schema；Vitest 做无浏览器数值/API 及布局/展示测试；Playwright 承担原三条用户闭环和后续已落地交互的必要回归，不以测试条数固定功能范围。
- Rationale and impact: 浏览器与 Node 共享计算核心，避免 Python/Three.js 两套物理状态；该工具有真实长期交互消费者，因此使用模块和专属测试，研究 Notebook 不作为产品入口。
- 实施 T1 核对选定依赖的 engines/兼容性与许可证，记录实际 Node/npm、锁定依赖到 `package-lock.json` 后再使用 `npm ci`。本轮不指定未经安装核验的具体版本，不承诺所有版本组合兼容。

拟布局按直接消费者划分，允许实现者合并小文件：

```text
src/core/       配置验证、纯数学、frame 图、运动学、晶体学、scene API
src/viewer/     Three.js 适配、几何体、视觉轴/杆/marker
src/ui/         参数面板、读数、JSON 导入导出
examples/experimental-setup/   同一场景的三类 JSON 输入
schema/        聚合 SceneConfig 及三类文件定义（$defs）
tests/         独立数值、API 和少量浏览器用例
```

核心内部使用 JS `number` 的双精度计算，仅实现本工具需要的 vec3、mat3、SE(3)、axis-angle/quaternion 操作；不开发通用线性代数库。矩阵可复用项目内窄 helper，但测试 oracle 不调用它们。源码、锁文件、合成配置与必要测试留 Git；`node_modules/`、`dist/`、`artifacts/` 默认忽略。截图/trace 只为发现失败或关键视觉核查保留，避免每次测试生成永久 receipt/manifest。

### 5.2 坐标、pose 与装配合同

- `T_A,B` 将 B 中的点映到 A；列向量、右乘链，`T_A,B = inverse(T_LAB,A) T_LAB,B`。方向只乘旋转，不加平移。
- 对外 matrix4 是长度 16 的 **row-major** number 数组，`m[4*r+c]`；位置单位 mm。quat 为 `[x,y,z,w]`，表示 child→parent 的主动旋转；比较旋转时接受 q 与 −q 等价。
- 固定 mount 用 `{position_mm:[x,y,z],quaternion_xyzw:[x,y,z,w]}`。旋转按右手正向；核心角度运算用 rad，接口/配置用 deg。
- 装配仅一棵 LAB 根 frame 树。每条边有 `frame_id,parent_frame_id,mount,motion`；motion 支持 fixed、revolute、six_dof、xy_translation，以及T9为Z平台新增的prismatic。图允许新增这些类型的实例，不承诺通用机构。

运动边统一采用“父系中的运动增量 × 零位 mount”：

$$
T_{A,B}(q)=J_A(q)T^0_{A,B}.
$$

φ：A=LAB，轴上点 c_φ 与单位方向 a_φ 均在 LAB；`J=Trans(c_φ) Rot(a_φ,φ) Trans(−c_φ)`。
H0 固定于 R；hexapod：

$$
T_{H0,H1}
=\operatorname{Trans}(t_H)\operatorname{Trans}(c_H)
\operatorname{Rot}(R_H)\operatorname{Trans}(-c_H)T_0.
$$

t_H/c_H 均在 H0。UVW 映射在 assembly 中显式保存 `rotation_convention`；首期支持 `extrinsic_xyz`：U/V/W 分别绕 H0 固定 X/Y/Z，依次 U、V、W，`R_H=Rz(W)Ry(V)Rx(U)`。未知 convention 拒绝，不悄悄套默认。它是演示约定，不声称是实际控制器口径；其他真实控制器映射须取得资料后另行适配。

H1→P0 是安装 mount；θ 边 P0→P1 绕 P0 中的点 c_θ、轴 a_θ，使用同一 revolute 公式；P1→P2 为 `Trans(x a_x + y a_y) T^0_P1,P2`，a_x/a_y 明确在 P1。P2→S 为固定夹具 mount；S→C 为 state 中的晶体姿态，原点在样品 origin。这样 XY 改变样品相对 θ 轴的位置，θ 同时带动 XY 及样品。

axis 对象统一为 `{frame,point_mm,direction}`；world point 由完整 T 映射，direction 用完整 R 映射后归一化。pivot 的物理位置为 `T_LAB,H0(c_H+t_H)`，不是把静态配置 c_H 直接画成当前物理中心。样品中心 `center_s_mm`、目标点 `target_point_s_mm` 分别声明，默认都为 S 原点。

Three.js 使用 engine 的局部 T 设置每个 frame Group，`matrixAutoUpdate=false`；按其 `Matrix4.set` 的行参数顺序赋值，不能把本项目 row-major 数组直接 `fromArray` 后默认为等价。真实父子层级保留；尺寸缩放只放在独立 mesh 子节点。更新后 `matrixWorld` 必须与 engine world T 对照，防止重复乘父级。

### 5.3 最小合成示例与几何

本节为保留的理想合成示例（`?example=synthetic`），只是可复算演示，非真实测量；T9以后网页默认实验室高度配置另见T9/T10与高度记录。合成示例机械尺寸与 mount provenance 均写为 synthetic：

| 对象 | 零位定义 |
|---|---|
| LAB/R/H0 | φ 轴过 LAB 原点、方向 +Y；R 与 H0 的零位 mount 为 identity |
| H1 | `T0=Trans(0,142.5,0) mm`；c_H=(0,200,0) mm；t/UVW=0；T8 将上盘抬高以缩短上部悬空 |
| P0 | 相对 H1：`Trans(0,57.5,0) Rx(−90°)`；与 H1 合计仍为 200 mm |
| P1/P2/S/C | 零位 identity；θ 轴为 P0 的 +Z；XY 为 P1 的 +X/+Y |
| 样品 | center/target=(0,0,0) in S；默认晶体 cubic a=b=c=3.5 Å，R_SC=I，目标 [001] |
| detector/beam | D 原点=(0,200,1000) mm、R=I；beam 过 (0,200,0) mm 沿 LAB +Z |

因此零位样品中心在 LAB (0,200,0)，θ 与 φ 轴都经过该点，c_H 与该点重合，默认 [001] 映到 LAB +Y。这给出不依赖真实设备参数的理想基准。修改 state 的 XY 或 orientation 即可构造偏心、偏轴用例，不复制整套配置。

简化外观支持圆盘/平板、双平面与 6 根视觉杆、θ 台、XY 滑台、夹具及圆柱/方柱/长方体样品。T8 下盘直径 240、上盘 180 mm、厚 12 mm；黑色转接板上下分别随 H1/H0，默认柱体顶面/下转接板、上盘/上转接板/θ/XY/样品在零位接触。尺寸为参考图合成比例。圆柱样品局部轴显式为 S +Z；支杆 base 在 H0、moving 在 H1，不反算机构。V03 解析测试另明确设置 T0=Trans(0,100,0)，不依赖本示例的新外观安装高度。

探测器有效区与外壳分离。D 原点在有效区中心，+x 沿像素列增加方向、+y 与 raw 行增加方向相反、+z=x×y。raw 像素用 0-based **像素中心**坐标：

$$
p_D(u,v)=((u-(N_u-1)/2)p_x,\ ((N_v-1)/2-v)p_y,\ 0).
$$

4288²、p_x=p_y=0.1 mm 时，有效边长 428.8 mm，像素中心范围 ±214.35 mm，外缘 ±214.4 mm。首期只定义像素原点/方向和显示有效区，不实现 ray intersection、PONI 导入或重复模拟衍射。

### 5.4 晶格和取向

device 的 cell 为 `{a,b,c,alpha_deg,beta_deg,gamma_deg}`，长度 Å。固定晶体 C 的笛卡尔嵌入：a 沿 +X，b 在 XY 平面且 b_y>0，c_z>0，A=[a b c]。由常规 cell 公式构造；必须检查长度正、夹角有效、Gram 正定与非退化。

R_SC 来自样品 state 的单位 quaternion。晶向和晶面法向分别为：

$$
\hat d_{[uvw],F}=\operatorname{normalize}(R_{F,S}R_{S,C}A[u,v,w]^T),
\qquad
\hat n_{(hkl),F}=\operatorname{normalize}(R_{F,S}R_{S,C}A^{-T}[h,k,l]^T).
$$

倒易基底固定 **不含 2π**，单位 Å⁻¹；方向输出归一化后无量纲。F 可为任意已注册 frame。拒绝全零索引、非有限输入、无效 cell/quat。显示 C 的正交三轴与 [100]/[010]/[001] 晶格方向时分别标注，非正交晶系不能把两组箭头画成同一组默认正交轴。

非正交 oracle：a=b=1 Å、c=2 Å、α=β=90°、γ=60°，则
`A=[[1,1/2,0],[0,√3/2,0],[0,0,2]]`（按行展示）。
[100] 与 (100) 法向相差 30°，用作直接/倒易混淆的反例。

### 5.5 配置、更新和保存

- `devices.json`：设备 id/type、output_frame、visual 尺寸、样品 cell/center/target 及每个参数的 provenance。XY 可用 `integrated_into` 引用 θ 设备，声明基座固定在 θ 旋转中心的一体台；此约束不取消 θ、X、Y 内部运动关节。未声明此关系的旧配置保留独立装配语义。
- `assembly.json`：frame 父子关系、零位 mount、运动轴/轴上点、pivot、joint 绑定与 rotation_convention。
- `experiment_state.json`：每个 joint_id 的数值、各样品 R_SC quaternion、目标晶向和显示选择。joint_id 唯一，例如 `rotary.phi`、`hexapod.x/y/z/u/v/w`、`theta.angle`、`xy.x/y`；unit 由定义显式给出，不从名称猜。
- 三类输入带 `schema_version:1`。聚合 `SceneConfig={schema_version,devices,assembly,experiment_state}` 在加载时统一校验。Schema 检查字段/类型/单位枚举；loader 检查引用、单根、唯一 id、连通性、无环、运动边/joint 完整性以及数学有效性。无需 JSON Schema 承担图算法。
- 机械位置/尺寸字段显式 `*_mm`，角度 `*_deg`；normalized axes/quaternion 的有效性由 loader 判定，零向量拒绝，合法非零轴归一化；frame 不接受 scale/shear。配置行程若提供，超界更新拒绝；未提供时仅代表演示未设限，不代表物理安全。
- 所有修改先校验候选值、生成完整快照，再一次性替换当前状态。错误返回 `{code,path,message}`，不部分更新；读数和渲染消费同一 revision。默认全树重算即可，不预建增量缓存。
- `save_state` 导出一个可序列化、自包含的 SceneConfig snapshot，包含当前 devices/assembly/state，不仅保存 joint 数值；`restore_state` 完整校验后原子恢复。因此修改 mount/cell 后保存仍能复现，不依赖机器路径或另一个配置版本。
- 两状态比较只读取两个合法 snapshot，返回有限的物理状态差异，不改变当前 scene/revision，不维护历史数据库；具体比较域与不兼容处理见 5.6。
- 三个示例文件是分工存储，导出 bundle 是一次性快照，不并行维护两份可写权威状态。JSON 下载/上传使用本地文件，不建 server/database 或自动远端同步。

### 5.6 无渲染 API 与几何量

`load_scene(config)` 返回 scene 实例；该实例提供以下最小能力。所有对象返回复制值，调用者修改返回数组不能修改内部状态。

| API | 输入与返回语义 |
|---|---|
| `set_joint_value(joint_id,value)` | 使用 joint 定义中的单位；检查有限值/行程，返回 revision |
| `set_platform_pose(device_id,pose)` | 首期仅 six_dof，pose={translation_mm,rotation_deg}；在该设备父系 H0 中按声明 UVW convention 设置六个参数，非 LAB pose，不做逆运动学 |
| `get_world_transform(device_id)` | device.output_frame→LAB 的 row-major T，包含 frame_from/frame_to 与 length_unit=mm |
| `get_world_position / get_world_orientation` | 同一 output_frame 的 LAB 位置或 child→LAB quaternion_xyzw；位置附 mm |
| `get_frame_transform(frame_a,frame_b)` | 返回 T_A,B；两个 id 必须已注册 |
| `get_crystal_direction(sample_id,indices,direction_type,frame)` | direct:[uvw] / reciprocal:[hkl]；返回 unit vector、frame、normalized=true、unit=1、direction_type；不输出未声明的 q 大小 |
| `get_point_to_axis_distance(point,axis)` | point={frame,position_mm}，axis 为 5.2 对象；统一到 LAB 后输出 distance_mm |
| `get_zone_axis_alignment(sample_id,zone_axis,rotary_axis)` | direct zone indices 与轴引用；返回 axis_error_deg、signed_dot、direction_aligned、目标点 point_distance_mm、point_centered 与二者合取 aligned |
| `save_state / restore_state` | 5.5 的自包含 snapshot；非法恢复不改变当前 revision |
| `compare_states(snapshot_a,snapshot_b)` | 两个合法 snapshot 的纯查询；返回 joint、设备 LAB 位姿和样品晶体/目标的比较摘要，不自动恢复或修改当前状态 |

比较范围保持有界：两个 snapshot 的 device/frame/joint/sample ID 集合、父子图、device.output_frame 与 joint 类型/单位必须一致，否则返回 `STATE_TOPOLOGY_MISMATCH`，不按数组位置配对或静默漏项。相同结构下，mount、轴、尺寸或 cell 可以不同，但返回 `configuration_changed`；显示选择变化单独返回 `display_changed`，不把它解释成物理运动。

差值方向统一为 **B−A**。joint 返回 A/B 值、原始差值及定义单位，角度不擅自按360°取模；设备返回 `translation_delta_lab_mm` 和相对旋转最短角 `rotation_delta_deg`（q/−q 等价）。

每个样品另返回 `crystal_rotation_delta_deg`：比较完整晶体取向 `R_LAB,C=R_LAB,S R_S,C` 的相对旋转最短角，接受 q/−q 等价。不能只比较一个目标轴，因为绕该轴的晶体旋转可能保持目标方向不变。样品同时返回 A/B 的有向 LAB 目标方向、索引与类型；索引/类型相同时返回0–180°的 `direction_delta_deg`，不取 absolute dot，避免把反向变化算成零；索引/类型改变则标记 `target_changed`，不伪装为同一方向指标。比较现有 snapshot 中全部设备/样品即可，不新增逐字段通用 JSON diff。

对归一化 d、a：

$$
\alpha_{\rm axis}=\arccos(\operatorname{clamp}(|d\cdot a|,0,1)),
\qquad
D=\|(P-c)\times a\|.
$$

实现 α 可用数学等价且近零稳定的 `atan2(||d×a||,abs(d·a))`，输出 deg、范围0–90°。保留 signed_dot 和有向晶向；反平行不改变 φ 正方向定义。默认“几何对齐”显示阈值为 angle≤10⁻⁶ deg、distance≤10⁻⁶ mm，配置中明示；它们是合成演示判据，绝非机械精度或测量误差条。

几何读数至少包括样品/目标点 LAB 坐标、到 θ/φ 轴的距离、到当前 hexapod pivot 的距离，以及目标晶向与 φ 轴的对齐误差。无需自动解方程移动设备。

### 5.7 最小页面与用户闭环

当前采用日间、观察优先工作台：约 1062 px 宽度下，左侧 240–280 px 装置树及单设备检查器，其余空间主要留给三维视口；JSON、详细读数和诊断按需打开。运动参数优先，安装与几何默认折叠；窄屏保留可观察视口。包含：

- φ、hexapod XYZ/UVW 与 pivot XYZ、θ、XY；样品 R_SC、目标索引及 direct/reciprocal 类型输入。非法输入标出字段，维持最后合法场景。
- mount、轴定义、尺寸及 cell 可通过结构化配置 JSON 编辑/导入后一次性应用，不要求完整拖拽装配编辑器；提供默认示例恢复。
- 安装位置 XYZ 与本级关节自由度分块：父坐标系和安装参考点的 LAB 坐标明示，装置级说明常驻当前参数区底部并随选择切换；取消重复参数浮窗，特殊参数说明放在对应块内。以固定安装基座承接整机移动；无独立基座的旋转级同步平移轴中心与零位 mount，保留关节读数。默认 XYθ 一体台共用安装位置，保留 θ 和 X/Y 行程；XY 固定基座只读显示 θ 中心，不提供独立安装调节。独立 XY 的安装点不含本级行程，pivot 编辑不等于底座移动。折叠状态不进入物理 snapshot。
- LAB/设备局部轴、C 正交轴和晶格方向的独立显隐；样品中心、target、pivot、θ/φ 轴显式可辨，beam 与 detector 不随台运动。
- 相机旋转/缩放/复位；参数提交后下一次渲染使用更新后的完整 revision，不以固定 FPS 作本期验收承诺。
- 保存为 JSON；导入文件后可选择“与当前状态比较”或“恢复”。比较摘要显示 joint 差值、设备 LAB 位姿变化、目标方向及配置变化标记，比较本身不改变场景；无需双视图或轨迹回放。读数可直接抄录或由 API 获取，Agent 可通过模块直接调用，无需观看图片或依赖浏览器全局变量。
- 场景若无 WebGL，明确报告无法显示；无渲染 API/数值测试继续可用，但不能因此宣称可视化验收通过。
- 三项关键读数（direct 带轴误差、目标点到 φ 轴、样品中心到 θ 轴）靠近视口；reciprocal 不冒称 direct 带轴误差。合成/未标定身份与操作成功提示分开，相机操作与恢复配置分开。
- 常规模式只保留目标点/目标方向、当前选择和必要旋转轴；设备 frame、C 正交轴和直接晶格放入显式坐标诊断，仍可独立显隐。选择、相机和诊断总开关不进入物理 snapshot；原 display 字段不改格式。
- 仅真实点/坐标原点在世界位置相同时归为共点；屏幕投影重叠只避让。方向箭头尖端和轴名锚点使用任意示意长度，即使世界坐标重合也单独避让，不形成共点摘要。共点摘要可打开真实成员及各 frame 的 LAB 轴方向；共点不等于同向，C 正交轴与直接晶格不得语义合并。
- 树、三维实体选择与单检查器同步，XY 子实体归入其 θ 宿主；拖动相机不得误选。最终边线强调主体，后代不自动获得同等高亮。展示策略、材质和取景可调整，不修改物理尺寸、间距、轴或晶向。

## Tasks

以下为实施顺序；勾选表示对应实现范围已交付，不代表整个 G0/G1 已接受。

- [x] **T1 工程入口与配置合同**：建立最小 npm/TS/Vite 工程、锁文件、ignore、Schema 与合成输入；交付 typecheck/test/build 命令。
- [x] **T2 独立运动学**：实现有限数学、frame 图、φ、T0/pivot、θ→XY 与 world 查询；V01–V05/V09 的核心数值部分通过，渲染关联由 T4 验证。
- [x] **T3 晶体学与 snapshot/API**：实现 cell/A、R_SC、直接/倒易方向、轴线/距离及场景实例 API（含状态比较），完成 V06–V11 和 V13 的无渲染验证。
- [x] **T4 G0 可视化**：以核心输出驱动 Three.js，简化设备/杆/beam/detector、局部轴与可配置 mount；实际世界矩阵、杆端点和 detector 有效平面对照通过，已形成三维初版。
- [x] **T5 G1 交互**：接入全部表单、方向/中心读数、JSON 导入导出及状态比较摘要，三条浏览器闭环通过；UI 复用核心计算。
- [x] **T6 验证与交付说明**：T6a–T6f工程完成、独立内容/视觉review通过；2026-11-11 Maintainer已明确确认五组网页验收全部通过，正式接受登记见Closeout。

T6当时按以下顺序完成工程收尾；用户正式接受由2026-11-11的确认另行登记，见Closeout：

- [x] **T6a 接手审计**：主 Agent 与 Astra high 核对 handoff、`d149f90`、未提交范围和历史证据时间边界。
- [x] **T6b 收尾合同审阅**：同步 Spec、README、handoff，Astra high 确认范围、顺序、验收与授权一致，通过后进入 T6c。
- [x] **T6c 最终交互与视觉证据**：真实浏览器点击 XYθ/六轴/φ，树—检查器—高亮一致；拖动/平移/缩放保持选择和物理状态；已看最终边线、窄屏 reciprocal 及方向端点偶合反例。首轮间仅修复标签共点语义，不改物理实现。
- [x] **T6d 最终源码验证**：首轮修复后 typecheck、83 项测试（58 核心＋25 展示）、build 与 7 条 E2E 通过，截图刷新；两项新增测试只针对实际共点 finding。
- [x] **T6e 内容与视觉双 review**：完成 Astra high / Terra xhigh 两轮独立审阅，首轮共点语义 finding 已修复并复验，第二轮两者均 PASS、无未闭合 blocker；没有开启第 3 轮。
- [x] **T6f 收尾同步**：README/Spec/handoff 已回填实际覆盖、终审 verdict 与边界；终审后仅机械回填状态及明确 `display` 保存语义。用户随后授权全部已审改动一起本地提交，现进入网页评审；G0/G1 正式接受仍待单独决定。

2026-11-10 网页用户反馈另作 T7，不改写此前 T6 两轮 review 的历史范围：

- [x] **T7a 说明布局与标签修复**：参数改普通 label；装置说明置底，pivot/XY/R_SC 专属说明贴近块。复现等距候选取整导致左右交替，并保留合法上一帧相对偏移、避免逐帧取整累积；越界/碰撞继续避让，不改物理锚点。
- [x] **T7b 验证**：86 项测试（58 核心＋28 展示）、typecheck/build、7 E2E 通过；回归含亚像素换边、相机跨帧、边界回退及真实小幅平移的标签侧向稳定，截图已刷新。
- [x] **T7c 内容与视觉 review**：Astra high、Terra xhigh 独立审阅实现及四张实际截图，均 PASS，无行为 blocker；已明确旧提交授权与当前 T7 未提交的状态边界。
- [x] **T7d 装置说明文字 review**：T7c 通过后，两位完成单轮文字审阅；已修正 LAB 固定装置、R_SC 影响范围及 pivot 的准确表述，去除重复列表与错误方位词，主 Agent 直接核对并复验，不另开文字审阅轮次；用户随后明确授权全部 T7 修改一起本地提交，现已保存。

T8 用户参考图视觉优化（上一基线 `dcf1942`；完成审阅后用户明确授权一起本地提交，现已保存）：

- [x] **T8a 材质与结构**：六轴银色金属上下圆盘，上盘直径为下盘 75%；黑色方形转接板分别绑定 H1/H0。示例 6 根视觉支杆仅连端点。XYθ 不同明度金属色、棕色样品、黄色方柱和蓝灰探测器可区分，树中有配置色块。
- [x] **T8b 基座与紧凑装配**：`#F8E68A` 方柱高度为外观尺寸，柱顶固定，不新增运动关节；snapshot 保存尺寸与 offset。H1 Y=142.5、P0 Y=57.5 mm，合计 200，sample/pivot/beam/detector 理想关系不变；零位各接触面已用实际 mesh bounds 验证，不宣称照片量测。
- [x] **T8c 验证与视觉检查**：87 tests、typecheck/build、8 E2E 通过；复合件继承/接触、柱体高度保存与已知位姿不变均覆盖。主 Agent 与 Astra high 对照两张参考图，查看装置/全景/样品/窄屏/高度250图，Astra PASS 无 blocker；用户随后授权全部已审 T8 修改一起本地提交，现已保存。

T9历史配置（六轴高度已由T10更正）：来源与澄清见 [高度记录](../../discuss/20261110_lab_height_survey.md)，粗测不等于标定。当时采用台面/六轴下板底面约670 mm，六轴含板总高约460 mm、上板顶面1130 mm、到1380 mm光斑余量250 mm。大样品台可升约100 mm；440 mm刚性架当前不使用，未来170 mm矮支撑件只记录、不实施。独立Z平台安装于六轴上板与XYθ之间，页面10–20 cm、初始15 cm、内部mm。其余示意尺寸保留，当时目标点1319.5 mm；当前默认数值以T10为准。

- [x] **T9a 提交与测量整理**：T8 已审改动提交 `f214ef1`；记录原值、单位、端点和待确认项，区分粗测/假设。
- [x] **T9b 高度配置与验证**：默认加载lab_height_config；新增独立prismatic Z平台与上下端可辨几何；台面升高与安装Y共用保持柱底的更新，光束/探测器固定；旧合成配置保留。高度预算、倾转后Z方向、cm/mm、边界原子拒绝与snapshot恢复均已核对。

T9验证与review：91 tests（61核心＋30展示）、最终typecheck/build通过，主JS774.26 kB/gzip204.60 kB，原体积提示保留。统一安装Y修复后9 E2E通过（33.0 s）；随后仅将范围文案改为按配置生成，专项E2E通过（6.4 s）并刷新ignored `artifacts/lab-height-{apparatus,sample,overview,mobile}.png`。首轮Astra指出安装Y不联动柱体、Terra建议动态范围文案，均已处理；第二轮Astra high与Terra xhigh均PASS，无blocker。未来170 mm支撑架未加入。用户随后授权本轮全部已审修改本地提交为06a6494；旧handoff按要求删除，历史保留在Git。用户网页评审和G0/G1正式接受仍独立；原5173服务保留，不推送、不创建PR。

T10 图纸更正：用户指出此前460 mm为读数错误。本体320 mm已经包含上盘18.2、下盘30 mm；上盘Ø260、下盘最大外径Ø348，外加上下各15 mm板后总高350 mm。默认大样品台改为450×450 mm截面，地面/台面670与可升100 mm不变。下盘以圆盘包络示意，不复刻非圆细节、孔系或机构。图纸原图集中保存在高度记录的assets下，供直接核对，不复制第二份尺寸台账。

- [x] **T10a 参考面与来源**：保留图纸及更正沿革，厂图原点/内部H1/pivot分别说明，不擅改控制坐标或UVW。
- [x] **T10b 外观与装配**：新增可选upper_disc_size_mm独立上盘尺寸，旧配置省略保持原比例；上下板分别按上/下盘厚度计算偏移。H0=700、H1=995.9、Z0=1020、Z15cm顶1170、目标1209.5 mm；光束固定1380，不自动补齐170.5 mm差值。450 mm方柱仍支持原升降。
- [x] **T10c 验证与双review**：mesh包络320/350、上下盘直径/厚度、方柱截面、非零倾转继承、cm/mm与保存恢复已验证；Astra high / Terra xhigh先内容、再最终视觉与文字两轮均PASS，无blocker，未自动提交。

T10验证：91 tests（61核心＋30展示）、typecheck/build PASS；9 E2E PASS（34.5 s），当前截图刷新为ignored `artifacts/lab-height-{apparatus,sample,overview,mobile}.png`，两位reviewer逐一查看。18.2 mm的Float32网格顶点误差约3.8×10⁻⁷ mm，仅相关mesh厚度断言用5×10⁻⁷ mm容差，核心数值容差不变。构建主JS775.00 kB/gzip204.90 kB，原Vite体积提示保留。图纸原始输入单份保存用于尺寸来源核对；下盘非圆细节、孔系与真实支杆解算未实施。旧合成示例/快照兼容通过，原5173评审服务保留；T10尺寸与配色现已按用户授权一并本地提交，G0/G1用户接受仍待单独决定。

T10后续分层配色：用户最终明确六轴主体亮银、上下转接板灰色。默认圆盘与支杆使用#DDE3E8，方形转接板为中灰#77818B；降低金属度以避免日间光照下变暗。XYθ改为同族青绿（θ底座#3E817B、XY滑台#87B9AC），Z平台炭黑、方柱浅黄、样品棕色。支杆颜色跟随所属六轴配置；树色块、装置说明与README同步。尺寸/位姿/高度预算沿用已审版本。主Agent已在5173核查装置近景、样品近景、窄屏及选中六轴截图 `artifacts/layer-palette-*.png`，相机/选择操作前后完整物理snapshot一致，窄屏无横向溢出；build/typecheck及diff检查通过（主JS775.16 kB/gzip204.96 kB）。Astra high、Terra xhigh单独进行配色delta视觉/说明review，均PASS，无blocker；两者提出的README“原配色”措辞已由主Agent改为“保留原主体visual.color，转接板/金属材质采用当前规则”。本次未重复运行91单测/9E2E，复用上方仍有效的几何证据；尺寸及配色现已按用户授权一并本地提交，原5173服务保留。

T11 公开试用与发布合同（2026-11-10授权）：维护者确认本项目可以公开，并要求用个人账户建立开源仓库，标明SSRF-BL12SW、开放反馈并准备Pages。连接器当前账户David-JA及公开个人资料已核对；gh初始active为代理账户shanernerak-dev，外部写入时切到David-JA并用API预检，结束恢复原active，不以Git提交身份代替API身份。

目标仓库 `David-JA/lab-frame-experimental-geometry`，公开、main、保留本地历史；不创建PR，不关闭Obsidian#38/Parent#32，不更改G0/G1勾选。之前“仅本地/不推送”是历史阶段约束，已由本轮明确发布授权替代。用户“评审通过后授权提交和推送”作为本轮条件授权：Astra high通过后可继续执行发布，无需重复询问。

- [x] **T11a 已审版本落盘**：T10尺寸/配色提交59e01ec。
- [x] **T11b 发布准备与Astra review**：README/网页标明SSRF-BL12SW；增加反馈链接与单一Issue表单；源码/原创文档MIT，用户图纸排除在MIT之外；核对公开内容范围和版本历史。工作流使用官方Actions固定SHA，Node24、npm ci、91项数值/展示测试、typecheck/build；仅dist进入Pages，构建失败不部署。
- [x] **T11c 公开仓库与Pages**：Astra通过后创建David-JA个人public repo、配置origin、推送main；Pages使用GitHub Actions/OIDC，构建子路径正确，原5173服务保留。owner/visibility、首次remote/main/HEAD、部署SHA/结论和线上WebGL参数交互已读回核对。
- [x] **T11d 反馈与Issue关联**：新仓库[公开试用与反馈#1](https://github.com/David-JA/lab-frame-experimental-geometry/issues/1)已创建，链接Obsidian#38和Parent#32；#38已仅替换原实施仓库/状态段并反向链接新仓库/Pages/#1，其余正文、数学合同与未勾选验收保持原文。README/网页可直接提Issue；反馈先澄清并更新Spec/必要验收，测试/review后发布，不自动承诺所有建议。

T11验收：本地unit/build及仓库子路径产物预览（非根路径JS/CSS可加载、网页标题/反馈链接正确、WebGL与状态更新可用、窄屏无溢出）；原几何证据继续复用，只对新增入口和发布路径做直接核查。线上以实际部署成功和浏览器加载为准，不把GitHub状态码200单独当成功。新GitHub跟踪Issue为公开试用入口，#38继续持有G0/G1验收；Pages公开不等于硬件标定或正式接受。

T11发布准备结果：91 tests与子路径build/typecheck通过，工作流/Issue表单YAML解析通过。临时4174预览访问仓库子路径，JS/CSS实际返回正常；标题/反馈链接正确，XY.x=1触发状态和1 mm读数，WebGL世界矩阵/探测器误差0、杆端误差1.42×10⁻¹⁴ mm；390 px无横向溢出，无pageerror/失败资源。截图为ignored `artifacts/pages-subpath-{desktop,mobile}.png`，主Agent与Astra直接查看；Astra本轮发布准备PASS、无blocker。公开历史文件范围与凭据特征检查未发现敏感凭据或运行产物；本地5173保留。此记录只说明准备就绪，实际仓库/部署/关联状态由T11c/d的回填持有。

T11发布结果：公开仓库[David-JA/lab-frame-experimental-geometry](https://github.com/David-JA/lab-frame-experimental-geometry)，[Pages线上入口](https://david-ja.github.io/lab-frame-experimental-geometry/)。首次部署72c7121f0a13f6ee5d31bf36d3fdff186a984a85的[Actions运行42815683196](https://github.com/David-JA/lab-frame-experimental-geometry/actions/runs/42815683196)中build/deploy均success；仓库homepage指向Pages、HTTPS启用。线上实测资源无失败、WebGL与XY参数更新正常、390 px无溢出，世界矩阵/探测器误差0，杆端误差1.42×10⁻¹⁴ mm；当前截图为ignored `artifacts/pages-live-{desktop,mobile}.png`。反馈#1由David-JA创建，#38仅状态段更新，保持Open及原验收。临时4174已停止，原5173/PID52776保持HTTP200；本次状态回填将另行提交/推送，最终远端HEAD与部署结果在任务交付前读回确认，不再修改产品功能。

T12 可读的诊断与设置（用户截图反馈）：主Agent与Astra high、Terra high梳理近景层级、颜色/箭头和中文表达。实现期间仅本地修改；用户随后单独授权本轮提交、个人账户推送及Pages更新。不改动已有数学、晶胞/旋转约定或snapshot格式。

- [x] **T12a 分层观察与箭头**：诊断分为晶体坐标/晶格方向/装置坐标/全部对照，默认晶体坐标。纯观察预设与原display保存开关相交，不改revision/snapshot；保存图层被关闭时给出明确提示和设置入口。晶体/晶格预设同时隐藏无关pivot/beam标签及旋转轴，装置预设看当前装置与LAB，全部对照保留工程核对。XYZ使用高对比红绿蓝，实心圆柱箭杆/粗虚线段取代1px线，目标方向更粗；保留实线坐标与虚线晶格的语义，不把任意箭长作为晶格长度。
- [x] **T12b 中文与任务顺序**：样品先选“观察哪个方向”，按晶向或晶面法向分别标u/v/w或h/k/l；切换只是重新解释指标，不做晶向/晶面换算。四元数移到默认折叠的高级取向区，方向与取向分别原子应用、互不读取另一组草稿，样品机械位置不变。隐藏固定样品的空运动区；配置文件可直接保存/载入，JSON编辑进入高级折叠区，保留原编辑/比较路径。
- [x] **T12c 验证与协作review**：四预设、非立方方向、独立草稿与非法输入、文件来源分离均通过验证。Astra high与Terra high两轮内容/视觉review PASS，首轮P2已闭环；主Agent直接看近景、样品设置、配置抽屉和窄屏。未自动提交/推送。

T12结果：92 tests（61核心＋31展示）、最终typecheck/build通过，主JS778.94 kB/gzip206.26 kB，Vite体积提示保留。10条E2E场景已全部取得有效通过证据：完整运行9条PASS，剩余配置旧中文断言适配后专项PASS；文件来源修复后配置/T12两专项再次PASS（12.1 s），未为未受影响的其余8条重复执行。新增流程覆盖直接载入、文件A与编辑器B隔离、无效JSON/零指标/非法四元数原子拒绝、方向/取向互不读草稿、四预设不改snapshot、关闭图层提示、非立方C轴与晶向区别及390 px布局。最终图在ignored `artifacts/readable-{crystal-closeup,lattice-closeup,sample-controls,mobile,file-settings}.png`。

首轮Astra/Terra均指出普通载入误读高级editor的P2；现用独立pendingFileText，选新文件先清空/禁用，读完只接受仍为当前选择的结果；高级JSON保持独立应用。指标不称C正交分量，四元数作为旋转R_SC的表示；相关文字建议已改。第二轮两位均PASS，无blocker。此轮core/Schema/示例物理配置及依赖未改；实现时仅本地评审，用户随后单独授权的发布结果见T12d。

- [x] **T12d 授权发布**：用户批准本轮全部已审修改提交、David-JA个人账户推送及Pages更新，已执行并核查。结束恢复原gh活跃账户，原5173服务保留。README拆分随后由用户单独授权，见T13。

T12发布结果：代码提交13b4a53dda787e9f032007c802c4c35ed2f14cfa，本地/远端main一致；[Pages运行42835001799](https://github.com/David-JA/lab-frame-experimental-geometry/actions/runs/42835001799)成功。线上默认预设为晶体坐标，切到晶格方向后各显示3个对应标注，snapshot不变；高级取向默认折叠，“应用观察方向”可见，WebGL正常，390 px无横向溢出，无pageerror/失败资源。主Agent已直接查看ignored `artifacts/t12-live-{desktop,mobile}.png`，原5173服务继续保留。当前状态文档另随本次提交推送，最新文档HEAD部署在交付前再读回，不重复未变更的产品测试。

T13 文档分层：README面向首次试用和启动，新增[项目维护记忆](../project_memory.md)面向架构、实现约定、维护与验证入口；尺寸/原图继续由原记录持有，不复制数字表。测试计数、耗时、截图清单和逐轮review不迁入维护记忆，保留本Spec及Git作为出处。Astra high只读review PASS，无blocker；对照原README、当前源码与运行配置，未发现关键遗漏或证明升级。27个本地Markdown链接可解析，diff检查通过。纯文档整理未重复产品测试；按本轮授权提交、David-JA推送。

- [x] **T13 文档整理与评审**：完成必要内容承接和双向导航，Astra high确认无关键约定遗漏或Spec台账重复；发布依本轮授权执行，保留原5173服务。

### T14 G0/G1验收前核查（2026-11-11）

本轮授权为工程核查、必要补测、Astra high / Terra xhigh review及用户确认项整理；不代替用户正式接受。基线为e5d2001。主Agent核对`13b4a53..e5d2001`中src、Schema、示例、测试、依赖及构建/浏览器配置无差异，T12以后仅有文档变更，因此复用T12的92项数值/展示测试、typecheck/build及10条浏览器场景有效证据；不声称这些命令在本轮全部重跑，也不把最后一次专项的`.last-run.json`当作十条全量运行凭证。旧人工拾取与视觉结论仅复用其已覆盖且未修改的范围。

验收映射中的G0/G1序号按#38各组原始复选框从上到下计数。2026-11-11只读核对#38仍Open，G0共8项、G1共12项均未勾选，未发现需求正文与本轮接受范围发生变化。

| 验收范围 | 本轮核查结论与证据 |
|---|---|
| G0第1–4项：LAB、外层父节点、φ继承、独立detector/beam；G1第1项：φ | 已实现并有有效证据。V01/V02/V04核对符号、相对变换及独立分支；V12和viewer测试核对实际matrixWorld。 |
| G0第5–6项：双平面/非约束杆、θ在下XY在上 | 已实现并有有效证据。V04的杆端点/上下平面，V05与一体XYθ回归；T9新增Z不改变θ→XY的继承关系。 |
| G0第7项、G1第6项：S/C分离、cell/取向及晶轴 | 已实现并有有效证据。V06的非正交30°反例、V07全链方向、V13绕目标方向旋转仍能识别完整晶体取向变化；T12预设区分C坐标与晶格方向。cell及完整安装姿态可通过配置/高级JSON修改，不宣称均有普通表单。 |
| G0第8项、G1第2–3及第5项：可配置安装、XYZ/UVW/pivot、θ轴和多中心偏差 | 已实现并有有效证据。V03独立解析pivot/T0，V05非零父姿态，V09固定垫片/非法装配拒绝，V12中心与目标点分离、φ/θ不共轴及安装联动。 |
| G1第4项：局部XY对中后θ旋转 | 已实现并有有效证据。V05在非零φ/UVW下对中并旋转θ；对应浏览器流程确认距离、中心及实际渲染。 |
| G1第7–9项：指定方向、全链更新、带轴/目标点几何 | 已实现并有有效证据。V07固定seed独立scalar参考、V08平行/反平行/偏心与30°反例；本轮补下述“补偿倾斜→φ扫描”的连续UI验证。 |
| G1第10–12项：保存恢复、Agent基础接口、Three.js一致性 | 已实现并有有效证据。V09–V13覆盖原子拒绝、完整恢复、B−A比较、程序内Scene接口和CPU世界矩阵/杆端点/D面/C原点；T12文件与高级JSON来源隔离证据仍有效。不要求另建网络API或MCP服务。 |

唯一执行缺口为已有V08/V12浏览器用例没有连续断言“晶体倾斜后用六轴补偿，再扫描φ”。在原用例中补充：合成示例R_SC绕样品X转+30°，hexapod.u=-30°；φ取0/90/180°时，带轴误差为0、目标点为LAB(0,200,0) mm、到φ轴距离为0、几何对齐为是，并核对实际WebGL/revision及matrixWorld等诊断。既有未补偿30°与反平行检查保留。`npm run test:e2e -- --grep 'V08/V12' --global-timeout 120000`通过（1场景，6.3 s），随后typecheck通过。未改产品代码，无需重跑未受影响的全套测试或build；新增断言的截图为ignored `artifacts/g0g1-aligned-scan.png`。

审阅结果：Astra high / Terra xhigh各自独立只读review，均PASS，无blocker。两位直接核对原始20项验收、源码与测试适用性，查看新补偿扫描截图及未变更范围的已有视觉证据；Terra另独立读取#38并检查全部指定截图。两位未重跑测试，复用上文有效执行结果，不扩大为实物标定或用户正式接受。Terra提出明确“读数详情”及高级区“查看差异”入口的两条非阻断文案建议，主Agent已局部落实并核对实际入口，不另开复审。工程核查与用户网页确认分别记录，正式验收仍未勾选；目前未发现需先新增产品功能的已确认blocker。

用户网页确认清单：每个独立场景开始前恢复相应示例；如有需要保留的当前参数，先保存配置文件。以下确认操作、空间表达和读数是否符合实际使用需要，数值正确性由上表工程证据支持。

| 顺序 | 操作 | 请用户确认的结果 |
|---|---|---|
| 1 装配与继承 | 打开`http://127.0.0.1:5173/?example=synthetic`，看全景；φ改45°，再令六轴U为10°。 | φ带动六轴与上方装配，detector/beam不跟随；U只改变六轴上运动面及后代，下平面不继承这次倾转；能区分θ下/XY上及各层。 |
| 2 XY对中 | 恢复合成示例，XY的x从0改1 mm，再将θ改90°；x改回0，再改变θ。 | 偏心时样品中心到θ轴为1 mm并绕轴移动；对中后距离为0且旋转不再公转。能清楚找到θ/X/Y和相关读数。 |
| 3 取向补偿与扫描 | 恢复合成示例，选样品，展开高级晶体取向，设qx=0.25881904510252074、qy=qz=0、qw=0.9659258262890683并应用；观察方向保持晶向[001]。六轴U设-30°，φ改0/90/180°；点“读数详情”查看目标点LAB坐标。 | 补偿前误差30°，补偿后为0°，目标点仍为(0,200,0) mm并在φ轴上。开启“坐标与方向”，切换晶体坐标/晶格方向，确认标注、配色和说明足以理解画面。 |
| 4 保存、比较与恢复 | 恢复合成示例，保存配置文件；XY的x改1 mm；配置中选回原文件，展开“查看或编辑 JSON（高级）”并点“查看差异”，再点“载入所选文件”。 | 选择文件或查看差异不提前改变场景；当前→文件的xy.x差值为-1 mm，载入后恢复0。能区分文件载入与高级JSON应用。 |
| 5 默认实验室装配 | 恢复实验室高度配置，观察方柱/六轴/转接板/Z/XYθ；Z高度在10–20 cm内调整，台面升高在0–10 cm内调整。 | Z与台面升高的联动易懂，光束保持固定。当前临时对中默认台面770 mm、Z=200 mm、六轴Y=+20.5 mm，样品中心与1380 mm束心等高；不把可见外形当作实际照明体或尺寸证据。各装置参考面仍由[#2](https://github.com/David-JA/lab-frame-experimental-geometry/issues/2)复测。 |

以上步骤不要求用户重做随机数值测试，不把简化外观作为实物标定。真实控制器UVW、pivot和认证行程，未来170 mm支撑架及G2继续按原边界另行处理。

### T15 中键拖动平移（2026-11-11）

用户网页评审反馈右键平移会与浏览器手势冲突，中键拖动只有很小变化。原实现沿用OrbitControls默认映射：中键是DOLLY缩放，右键是PAN平移，并非平移速度偏小。现显式设置左键ROTATE、中键PAN、右键null；保留正常panSpeed与滚轮缩放，页面提示改为“左键拖动旋转 · 中键拖动平移 · 滚轮缩放”。不改物理状态或snapshot格式。

既有工作台回归的小幅标签平移改用中键，补充80 px横向/50 px纵向拖动后的真实锚点屏幕位移检查，并确认右键拖动不移动相机、选择/revision/snapshot不变。首轮曾错误地假设不同深度两点的投影间距在平移后不变，透视视差使该断言失败；已移除此错误判据，保留直接的位移、标签与状态检查。工作台专项最终PASS（1场景，8.7 s）；同批已通过的Screen labels流程（含左键旋转、滚轮及标签边界）继续有效，未为测试断言修正重复执行。最终typecheck/build PASS，原Vite体积提示保留；未重复无关核心数值测试。T14双review对应其核查版本，本次鼠标变更未新增独立review，不将旧结论扩大为对新diff的审阅。

当前本地网页采用新映射，等待用户确认中键手感；收尾发现原5173进程已退出，已重新以隐藏后台启动loopback 5173并读回HTTP 200。正式G0/G1接受不变，尚未提交或推送。

T2/T3 的部分测试可在类型/配置合同稳定后独立开展，但渲染依赖相应核心结果。只在实物参数到位时增加“实物配置核对”这一独立验证，不阻塞合成场景实现，也不把它冒充已完成。

### T16 单轴连续运动与角度显示（2026-11-11）

用户批准在当前装置的“运动调整”标题下统一放置选轴、速度、开始/暂停三个控件，不在每个参数旁重复按钮。覆盖φ、六轴XYZ/UVW、θ/XY、独立Z平台及台面升高；安装位置、pivot、外观尺寸、晶格/取向草稿不作为自动运动轴。位移速度统一mm/s（含位置用cm显示的Z/台面升高），旋转为°/s；正负号控制方向，非有限或零速度拒绝。界面文字中的deg改成°，配置Schema、JSON字段和API的deg/rotation_deg等标识保持兼容。

全局一次仅一个轴，按照真实帧间时间平滑更新，继续复用Scene原子校验与渲染；暂停保持当前位置，再次开始从当前值继续。切换轴/装置、改速度或手动参数、应用/恢复配置、打开配置抽屉、收起当前运动区、页面隐藏或离开时暂停；未恢复的后台时间不补跑，明显卡顿也暂停。到配置行程端点精确停在端点并说明原因，无限位的轴由用户暂停。运动选择、速度和运行状态不写入snapshot，保存的是当时实际参数。

实现与验证：新增UI层SingleAxisMotion，保持计算核心/Schema/输入配置格式不变；正负速度/变帧间隔、暂停继续与单轴互斥、已知限位、失败拒绝、卡顿暂停及首帧时钟反例由6项独立时钟单测覆盖，连同既有92项共98 tests PASS。最终typecheck/build PASS。浏览器全量中原10条均PASS；新增连续运动流程最初未冻结测试时钟，自动操作耗时影响累计位置断言，修正为受控时钟后专项PASS，并补手动输入立即暂停、cm/mm换算、Z/台面升高端点、模拟visibilitychange、配置恢复取消旧回调和三控件布局。窄屏测试显式将控制栏滚动到sticky视口下方，断言不被遮挡。后台及离页缓存验证采用事件模拟，不宣称实测操作系统最小化或实际浏览器后退缓存命中。已有10条证据复用，不因局部修复、测试时钟或截图修订重复执行。截图为ignored `artifacts/motion-{desktop,mobile}.png`，主Agent检查中文、°及控件排列。原Vite体积提示保留。

Astra high首轮提出两项P2：首帧混用performance.now与rAF帧时间可能误暂停，以及persisted pagehide销毁监听导致缓存恢复后后台暂停失效。已统一使用clock.now；新增now=100 ms启动、rAF参数99 ms而当前now=108 ms的反例，确认继续运行且累计0.008 mm。pagehide始终暂停，仅非缓存离页才dispose；浏览器新增模拟persisted pagehide→pageshow→重新开始→visibilitychange后仍暂停的流程。修复后98 tests、最终typecheck/build及Continuous motion专项（1场景，13.2 s）通过。Astra high第2轮只读定向复审PASS，确认两项P2闭环，无剩余blocker；沿用首轮桌面/390 px视觉结论及未受影响的原10条浏览器证据，未要求重跑。保留T14/T15未提交修改，不将工程review等同G0/G1正式接受，本轮不提交或推送。

### T17 连续位移标签稳定性（2026-11-11）

用户反馈移动时目标/当前装置标签再次换边。T7仅在同一批label对象的相机重投影中保留offset；连续运动每帧调用SceneLabels.set，旧组被清空，位置记忆随revision丢失。本次在重建前按标签角色及共点成员文本组成的稳定身份承接上一帧offset，不以world坐标或Three对象UUID识别移动标签。成员排序不改变身份；共点拆分/合并或重复且不唯一的身份不继承，新的布局仍完整检查边界、锚点保护和碰撞。不修改物理几何、Scene状态、运动时钟或snapshot。

新增确定性显示单测：锚点在亚像素位置移动，每次以新对象/revision重建并交替成员顺序，确认相对偏移不丢失且world元数据持续更新。99 tests、typecheck/build通过。新增真实浏览器流程在连续X位移及中键平移叠加期间逐步采样，确认当前装置与目标方向标签的相对偏移稳定、参数确实变化及渲染一致；连同原Screen labels、Workbench流程共3项专项PASS（19.1 s），保留相机/边界/共点反例。截图为ignored `artifacts/moving-labels-stable.png`；其他仍有效的T16证据复用，未重复完整12条流程。本次为该回归的局部修复，不声称T16旧review覆盖此新diff；尚未提交或推送。

### T18 当前器材运动复位（2026-11-11）

用户确认T17闪烁已解决，要求在运动区标题右侧增加一键复位，并进一步明确按钮、提示、说明统一使用“复位”，不区分其他操作名称。按钮先暂停连续运动，再构造一个候选snapshot，一次restore_state完成当前装置所有运动轴的更新；六轴同时处理XYZ/UVW，XYθ同时处理θ/X/Y，大样品台同时处理φ与台面升高。pivot、其他装置关节及非运动安装不恢复为示例值。台面升高复位沿用原高度联动更新mount/轴心/柱体，保持柱底；提取公共候选更新逻辑，避免多轴逐个提交。常规轴回0，行程不含0时取允许范围最接近0的端点，默认Z平台100 mm即界面10 cm，旁边明确说明。点击按钮不折叠运动区，无独立运动的样品/探测器不显示该按钮。

验证：新增真实浏览器流程覆盖运动中复位、单次revision提交、完整snapshot仅当前六轴值变化、XYθ三轴同时复位、Z合法高度、台面升高联动与其他关节保留；连续运动既有专项PASS。首轮按钮负margin使窄屏标题上沿越界4 px，已去掉负margin，最终复位专项PASS（1场景，4.8 s），主Agent直接查看桌面与390 px截图 `artifacts/motion-reset-{desktop,mobile}.png`。typecheck/build通过；复用未受影响的既有数值及标签证据，不重复全量13条浏览器流程。本次未新增独立review，原T16 review不扩大到本diff；README与项目维护记忆同步，本轮不提交或推送。

### T19 本批提交与发布（2026-11-11）

用户授权整理现有修改、同步状态并提交推送。本批以e5d2001为基线，包含T14–T18全部现有修改；此前各段“尚未提交/不推送”是其实施时授权边界，本轮发布授权已替代，不删除这些历史事实。采用一个提交保存实现、回归与文档，推送David-JA个人仓库main，由既有Pages工作流执行测试/构建/部署；不创建PR，不更改#38验收复选框。

最终有效验证覆盖99项单元/展示/时钟测试、typecheck/build，以及13条浏览器场景。浏览器证据来自T16全量中原10条通过和后续连续运动、移动标签、器材复位专项；T17重新检查其中Screen labels/Workbench，本批没有声称在最终版本重跑完整13条。T18最后只改复位术语/按钮对齐，复位专项与最终构建已通过，其他未受影响的证据复用。T14有Astra high/Terra xhigh核查review，T16有Astra high两轮review且两项P2闭环；T15/T17/T18仅完成所记录的工程验证及视觉检查，不扩大既有review范围。用户已确认T17闪烁解决，未因此判定G0/G1正式接受。

计算核心、Schema、示例输入与依赖没有变更；运动速度及运行状态仍不持久化，配置/API保留deg，界面使用°。截图和临时测试结果继续ignored，不新增handoff或另一份验收台账。具体提交SHA及发布结论从Git与对应Actions读取，本地评审服务不关闭。

### T20 衍射预览与本批发布同步（2026-11-11）

新增功能的完整需求、实现与review由[衍射预览Spec](./20261111_diffraction_preview_spec.md)承接，不把G2整体并入本期验收。当前预览已支持体积重心、四月PONI参考、有限倒易球、HKL、灰度圆斑、a/d联动、运动中1s采样和暂停补算；高斯相对强度图与真实实验强度评估仅登记[#3](https://github.com/David-JA/lab-frame-experimental-geometry/issues/3)，未实施。

默认实验室配置按用户要求把基础台面由670临时调为770 mm，并以Z平台200 mm/六轴Y+20.5 mm对中；演示pivot与样品中心同高，原粗测与待复测状态保留于[高度记录](../../discuss/20261110_lab_height_survey.md)及#2。旧合成示例的几何验收预期不变。T9/T10的高度数字是历史默认，不再描述当前默认配置。

本批以`b416de8`为基线，用户已明确授权将本轮累计功能、测试和文档一起本地提交并推送个人仓库main，触发既有Pages工作流。具体SHA、CI及部署结果由Git/Actions持有，不创建PR、不关闭#2/#3、不修改#38正式验收。新增功能交付不自动闭合T6或将本Spec标Done。

本批提交前当前源码112项单元测试/typecheck/build证据有效，完整17条浏览器流程已补跑并全部通过（约1.3min）；新高度与上方运动学、状态恢复、标注、复位等既有功能的联动已回归，用户5173服务保留。

## Validation

下表定义验收预期，实际执行覆盖见 Outcome；未执行的渲染/浏览器部分不得据数值测试自动标为通过。测试以新仓库可丢弃合成数据为输入，不访问 PWA raw、accepted derived 或真实仪器。

默认数值尺度限定为机械场景 ≤10⁴ mm、正常非退化 cell；位置 absolute tolerance=10⁻⁸ mm，旋转/单位向量分量 absolute tolerance=10⁻¹⁰，独立角度比较≤10⁻⁸ rad，矩阵相对检查补充 rtol=10⁻¹⁰。容差是软件数值判据；若失败先查单位、矩阵顺序与浮点路径，不静默放宽。

| ID | Given / When | Then / 独立 oracle |
|---|---|---|
| V01 零位与方向 | 加载 5.3，全部 joints=0；另令 φ=+90° | T_H0,H1=T0；样品=(0,200,0)；LAB 点 (1,0,0) 绕 +Y 后=(0,0,−1)，验证符号/单位 |
| V02 外层继承 | 固定 hex pose，改变 φ，包括同时存在非零倾转 | 所有 R 后代受同一 LAB 左乘；H0⁻¹H1 不变；detector/beam 不变；与测试独立的 Rodrigues 公式对照 |
| V03 pivot/T0 | T0=Trans(0,100,0)、c=(0,150,0)，Rz=90°；再 t=(3,4,5) | H1 原点分别到 (50,150,0)、(53,154,5)；T0⁻¹c 这个局部点始终到 c+t=(3,154,5)，排除只检查配置 c |
| V04 局部/视觉关系 | H1 平移/倾转，更新杆与所有显示 group | H0 不受 H1 影响；杆两端分别等于对应 frame 端点；CPU matrixWorld=engine world，视觉 scale 不改变 frame |
| V05 XY 对中 | 在 θ 的 XY 平面构造 +1 mm 偏心，减去局部 X 1 mm；改变 θ，另取非零 φ/hex pose | 对中前 D_θ=1，后 D_θ=0；固定父级时 sample center 不随 θ 公转，XY 部件随 θ 转；不能用 LAB X 代替局部 X |
| V06 直接/倒易 | cubic 与 5.4 的 γ=60° cell，相同 [100]/(100) | cubic 对应方向一致；非正交例两方向夹30°，并且 a*·a=1、a*·b=0 |
| V07 全链晶向 | 已知 R_SC，分别及组合改变 φ/UVW/θ | 用测试侧独立 matrix/Rodrigues 连乘比 LAB unit vectors；不调用生产变换构造函数生成 expected |
| V08 带轴扫描 | d=±Y、target 在 φ 轴；再令偏心1 mm、d 与 Y 夹30° | ± 均 axis_error=0，signed_dot=±1；理想 target 不动；偏心轨迹半径1；φ=90° 后该偏轴晶向与原方向夹 acos(0.75)≈41.409622° |
| V09 配置拒绝 | 缺必需字段、坏 unit、unknown id、重复 id、坏 parent、环、零轴、非法 quat/cell、NaN/Inf 的内存 API 输入 | Schema/loader 分责返回可定位错误；加载/更新原子拒绝，原 scene/revision 不变；未知 UVW convention 明确拒绝 |
| V10 保存恢复 | 非零组合下导出，随后修改 mount/cell/joints/晶体取向，再恢复；另导入无效 snapshot | 合法恢复全部 transforms/晶向/目标及配置一致；输出数组外部修改不污染 engine；非法恢复保留旧 scene |
| V11 查询/像素/随机 | T_A,B 与逆变换；D 的四角像素中心；固定 seed=38 的100组有界姿态 | 相对变换闭合；pixel(0,0)=(-214.35,+214.35,0) mm；独立 scalar 参考不依赖生产 math helpers；同 seed 可复算 |
| V12 浏览器闭环 | 页面加载；偏心→对中→θ；取向→φ；导出→修改→比较→恢复；安装联动与折叠/提示 | UI 与 API 同 revision；比较不改变 revision，恢复回到保存状态；非零 φ 下移动底座保持 joints，六轴/θ/XY/样品继承且 detector/beam 独立；数值 inspector/CPU matrixWorld 符合核心；无未处理 console error；canvas 可见且尺寸有界；1062 px 与窄屏布局、提示和轴标识可读 |
| V13 两状态比较 | 比较 A=A；5.3 零位 A 与 xy.x=1 mm 的 B；再比较 φ=90°、仅 R_SC 绕目标 [001] 旋转90°、配置变化或不匹配 ID 的状态 | 同状态全部物理差异为零；B−A 的 joint delta=+1 mm、sample translation_delta_lab_mm=(1,0,0)，目标方向差0°；φ=90° 时 sample 旋转差90°而 [001]方向差0°、detector 不变；仅 R_SC 绕 [001] 旋转90°时，joints、机械 S 位姿及目标方向差均为零，crystal_rotation_delta_deg=90°；尺寸/cell 改变须 configuration_changed=true；ID/拓扑不匹配明确拒绝且当前 scene 不变 |
| V14 工作台最终选择 | 在真实浏览器点击 XY 子实体、六轴、φ；再旋转拖动；对照树选择 | XY 归到 θ 宿主，树/单检查器/渲染 selected id 一致；拖动前后 selected id 不变（不能只比较 snapshot）；选择/相机/诊断不改变 revision 或物理 snapshot；最终边线截图能区分主体与后代 |
| V15 关键标签与取景 | 近景、非零姿态、旋转后、1062×956 与 390×844；direct/reciprocal | 显式断言目标方向/法向标签与目标点摘要可见且在视口内，不仅检查未 hidden 标签；必要共点入口可达，详情保留真实成员/各轴方向；C 与晶格独立，中文/负号/数学符号可读 |
| V16 标签跨帧稳定与说明布局 | 左右近等距锚点以亚像素平移；真实全景小幅中键平移；选择不同设备 | 仍合法的相对位置持续跟随锚点，不反复换边或滞后；越界/碰撞重新避让，物理状态不变；无参数 tooltip，装置说明位于当前参数区底部，特殊说明在其参数块内 |
| V17 复合外观与高度 | 六轴 W=90° 且平移(2,3,4)；柱体高度180→250→恢复；非法0 | 上黑转接板中心到LAB(47.5,203,4)、下板仍(0,−12,0)，直径180/240；零位接触面一致；柱顶−18不变，尺寸/offset随snapshot保存，assembly/joints/sample位姿不变；0原子拒绝；三种取景及窄屏关键标签可用 |

V15 具体反例：C 相对 S 方向一致、`center_s_mm=[-30,0,0]` 时，C X（55 mm）与 [100]（85 mm）的示意端点同为 LAB (55,200,0)。两条方向标签仍须独立避让、不生成共点按钮；真实 frame/point 共点与详情继续有效。任意方向/轴名端点均不用于物理共点归组。

浏览器数值检查复用 V01–V11 预期，不用截图像素差作物理判据；独立人工看一次示例的层级、杆、晶轴标注和中文/负号/数学符号。页面中文明确使用可用的 Microsoft YaHei 或 Noto Sans CJK SC，不能依赖日/韩字体替代。自动测试只等 revision/条件满足，不固定 sleep。Playwright/WebGL 不可用时记录缺口，不能将页面部分标为通过。

命令：`npm ci --ignore-scripts`、`npm run typecheck`、`npm test -- --run`、`npm run build`，以及 `npm run test:e2e`；本地预览用 `npm run dev -- --host 127.0.0.1`。首次创建锁文件使用安装命令，之后复验才用 ci。未执行的命令不得被报告为通过；浏览器测试入口在 T4/T5 落地。

本轮已有依赖，不重装；浏览器使用已验证的正常 Windows 用户边界与 Edge/SwiftShader。本机 `socks5:` 代理仅在测试进程临时追加 loopback `NO_PROXY`，不修改持久环境。E2E 自行启停 strictPort 4173；人工预览可另用 strictPort 4174，结束只停止本任务进程。用户现有服务不接管或关闭。截图放 ignored `artifacts/`，测试/源码由 Git 承载，避免另建版本副本。

## Outcome

2026-11-10：T1–T3 的独立核心已实现。Node 24.17.0 / npm 11.13.0；锁定 Vite 8.3.7、Vitest 5.1.0、Three.js/@types/three 0.187.0、Ajv 8.20.0（均 MIT），TypeScript 7.0.2 与 Playwright 1.65.0（Apache-2.0）。依赖安装禁用 lifecycle scripts。

无渲染数值/API 测试 43 项、`typecheck` 与实际三维应用 `build` 通过。加载器拒绝非法运动祖先、跟随运动的探测器、缺失像素参数和偏离 +Z 的入射方向，并保留合法固定支架链。

T4/T5 已形成可交互初版，V04/V12 的三条浏览器流程在正常 Windows 用户边界、Edge headless / SwiftShader 下通过。实际 Three.js matrixWorld、杆两端、C 正交轴原点及 D 原点/有效平面的偏差均受测试约束；补充中心/目标点分离、φ/θ 不共轴配置，确认中心到 θ 轴、目标点到 φ 轴及各自到 pivot 的读数。轴线有名称与颜色图例；C 正交轴以 C 原点为起点，晶格示意箭头置于样品中心。页面截图已核查全景/近景、中文、负号与数学符号，Windows Microsoft YaHei 可用。沙箱首次 browser-run 长时间无新输出，已中断并核查无本任务遗留进程；正常用户边界的成功结果不反推沙箱通过。

实现细化：为独立测试补入 `@types/node 24.19.2`（MIT）；`visual.offset_mm` 是可配置的外观锚点，不进入机械 frame；detector 有效区在 D 的 z=0、外壳在其后方；C 正交箭头不与通用 frame 开关混为一组。固定依赖与源码由 Git 持有，截图位于 ignored `artifacts/`。

2026-11-10 用户反馈修订：日间模式、分层可折叠装置卡片、安装位置/自身自由度拆分和参数联动提示已落地，原三条流程与新增安装继承/折叠/提示/响应式流程共四条通过。已核查非零 φ 下大样品台安装平移，以及六轴/θ/XY/样品安装后的独立已知坐标；关节读数保持，detector/beam 分支独立，非法安装更新不改变 revision。直接绑定 LAB/派生晶体 frame 的设备无独立 mount，面板显示只读参考；LAB detector 恢复已加入浏览器回归，避免核心接受后控件重建失败。截图核查覆盖 1600 px、1062×956 和 390×844。首次布局回归发现 canvas 尺寸反馈导致页面异常增高，已通过绝对定位 canvas 消除内容尺寸反馈，并增加实际画布尺寸断言。

接手核查修复：加载器分两步注册派生晶体 frame、解析设备引用，消除 C 绑定固定支架随设备数组排序被误拒的问题。新增三种排序下的加载、关节更新和反序 snapshot 恢复回归，并补充晶体 frame 与 LAB/装配 frame 冲突、重复晶体 frame、非样品晶体定义的原子拒绝断言；数值/API 测试共 50 项通过。浏览器恢复流程加入支架排在样品前、绑定 C 只读位置和后续关节运动/渲染核查，四条流程及 typecheck/build 通过。本机代理为 `socks5:` 时，仅在测试进程的 `NO_PROXY` 中追加 loopback 地址后复验；不修改持久代理设置。

坐标与标注修订：改为固定 12 px 的屏幕空间文字、共点成员合并、避让和锚点引线，窗口/相机变化只重排文字，不移动物理 frame 或晶向。保留 XYZ 红绿蓝，C 用实线箭头、直接晶格用虚线箭头，φ 金色实线/θ 紫色虚线并显式标记共轴；目标使用品红色、pivot 使用灰色空心标记，目标点与目标方向分别命名。坐标/晶格显示开关同时移除对应标注。新增 5 项布局单测及第 5 条浏览器流程，检查固定字号、真实锚点、共点成员、DOM 边界/重叠、开关、相机旋转/缩放与非零姿态；既有物理矩阵与杆端点检查保留。审阅截图位于 ignored `artifacts/labels-*.png`，视觉审阅结论仍由任务聊天持有。

XYθ 一体台确认修订：用户确认合并卡片、锁定 XY 基座在 θ 中心、保留 θ/X/Y 行程。默认示例新增 `xy.integrated_into="theta"`；核心依据实际 θ 轴中心及固定安装链检查零行程基座，不将 P2 的运动位置误当基座，并保留独立旧配置兼容性。新增 8 项数值/配置回归，数值/API 共 58 项；第 6 条浏览器流程检查单卡、共同安装、只读基座、三个关节、非法偏移原子拒绝、反序恢复及旧配置。截图在 `artifacts/xytheta-{integrated,mobile}.png`。

工作台接手时，基线 `d149f90` 后的工作台、轻量标签/共点详情、树与单检查器、展示策略和选择接线已实现但未提交；这些改动现随本次本地提交保存。handoff 中 13:18 的旧测试/截图早于 13:22 边线调整；本轮 13:47–13:48 对最终源码重新执行 typecheck、81 项测试（58 核心＋23 展示）、build、7 条 E2E，均通过，主 JS 764.88 kB / gzip 201.44 kB。V14 人工在真实浏览器点击 XY 上台面、六轴和露出底面的 φ，确认选择闭环、无物理状态改变，旋转/平移/缩放不误选；不要求穿透遮挡拾取，也不声称七条自动流程覆盖所有人工点击。V15 在自动流程显式检查目标方向/目标点可见与边界，旋转后 selected id 不变；另人工核查窄屏 reciprocal 法向可见且不报告 direct 带轴误差。

第 1 轮内容/视觉 review：Astra high PASS 并提两处文档小修；Terra xhigh 指出任意绘图长度的方向尖端被误归物理共点、详情不能列出方向。已将归组限为 frame/point，方向/轴名分别避让；新增纯分组及真实 viewer 反例两项测试，并将同一反例加入既有浏览器流程，正常共点详情仍保留。13:54–13:55 修复后 typecheck、83 tests（58 核心＋25 展示）、build、7 E2E（25.2 s）通过，最终主 JS 764.97 kB / gzip 201.48 kB。不改核心/Schema/示例/依赖。

最终截图已刷新到 ignored `artifacts/workbench-*.png`、`labels-*.png`、`final-direction-overlap.png` 及人工 `final-picking-{xy,hexapod,phi}.png` / `final-reciprocal-mobile.png`，主 Agent 已查看。产品变更仅限标签分组，不影响已有实体拾取与边线证据；原人工选择截图继续复用该范围。4174 人工预览已停止，测试服务由 E2E 管理。

第 2 轮内容/视觉终审：Astra high、Terra xhigh 均 PASS，无未闭合 blocker。两位直接查看新增方向偶合反例与刷新后的桌面/全景/窄屏图，并复用修复后有效验证；未重复运行全套。README 中观察状态的边界已明确：只有选择、相机、诊断总开关不进入 snapshot，原三个 display 开关仍保存。T6a–T6f 完成；用户随后授权全部已审改动及状态文档一起本地提交并启动评审网页，不推送、不建 PR。网页用户评审、G0/G1 正式接受及 Spec 后续归档单独决定。

上述T6工程收尾当时尚待用户接受；2026-11-11已获明确接受并闭合T6，见Closeout。实物参数标定与G2并未因此接受。Vite体积提示保留，评审记录由任务聊天持有。

`dc449b1` 提交后的 T7：已取消重复参数浮窗并移除悬停虚线；装置说明集中置底，特殊说明在参数块内。标签闪烁的确定性反例为锚点 x=200.1/200.9/201.1/201.9 时旧布局侧向右/左/右/左交替；修复复用每组上一帧合法相对位置并保留亚像素精度，避免慢速运动时取整累积。新增浏览器小幅真实平移断言侧向不变，既有防重叠、边界、共点语义和 snapshot 检查保留。

T7c 内容/视觉 Astra high、Terra xhigh 均 PASS；随后单独 T7d 文字审阅指出默认 LAB 探测器不应“随上游运动”、R_SC 不应声称所有机械对象不变，已分别改为固定 LAB 基准及样品机械位姿不变（不排除 C 绑定对象随取向变化）。pivot 使用“可能改变下游位置”，删除“下方 X/Y”错误方位词；安装与联动影响集合相同才引用“上述装配”，不相同时保留实际列表。主 Agent 核对最终页面及源文，无新增功能，不追加审阅轮次。

14:27–14:28 文字修订后最终 typecheck、86 tests、build、7 E2E（31.2 s）通过，主 JS 765.62 kB / gzip 201.74 kB；另在 5173 实页确认固定探测器文案、无 tooltip 及说明确在参数区底部，最终图为 ignored `artifacts/description-footer-final.png`。核心/Schema/示例/依赖未改，T7a–T7d 完成；用户随后授权全部已审修改及状态文档一起本地提交，现已保存，5173 评审服务保留。不推送、不建 PR，G0/G1 正式接受仍待单独决定。

T8 完成：核心算法/Schema/依赖未改，更新合成示例形状、颜色、视觉支杆与两处配套零位 mount。新增复合件/接触/运动继承测试及柱体外观高度浏览器流程；87 tests、typecheck/build、8 E2E（31.8 s）通过，主 JS 767.76 kB / gzip 202.38 kB。主 Agent 与 Astra high 均对照参考图检查装置近景、全景、样品近景、窄屏与高度250图；Astra PASS，文档建议已同步。用户随后授权所有已审视觉修改及状态文档一起本地提交，现已保存；现有 5173 服务保留，不推送、不建 PR。

## Durable outcome

- [x] README保留实际启动、试用与反馈入口，测试/维护命令及稳定约定由docs/project_memory.md承接；不复制第二套Issue验收台账。
- [x] 当前功能说明同步于README，维护约定由docs/project_memory.md持有，实施/验收状态由本Spec与#38持有；尺寸来源仍在原粗测记录。旧handoff按用户要求删除，历史事实由Git保留；未预建AGENTS、CHANGELOG或独立执行ledger。

README随真实实施结果更新。本阶段经Maintainer正式接受后标Done并移至docs/archive；原discuss地址只留导航，归档正文为本阶段合同与证据的唯一文档来源。

## Closeout

- [x] T1–T6实施结果、设计偏差和验证结果已回填；2026-11-11 Maintainer已正式接受G0/G1，T6闭合。
- [x] README与项目维护记忆中的实际入口、命令及限制已同步，G0/G1的接受范围可核查。
- [x] 用户明确授权归档，两份已完成Spec移至docs/archive并更新入口；原discuss路径只保留短导航，继续可读。没有新建PR或执行merge。

### 正式接受与Merge Ready登记（2026-11-11）

Maintainer确认装配与运动继承、XY对中、晶体取向补偿/扫描、保存比较恢复、默认装配五组网页检查全部通过，并明确授权登记和归档。接受版本为`c3e4480`，复用该版本112项单元测试、17条完整浏览器流程、typecheck/build与Pages成功部署证据；本次只更新文档及Issue状态，不重复跑无变化的数值/WebGL测试。

#38只勾选G0的8项与G1的12项，G2的4项继续未勾选，Issue保持Open并登记Merge Ready。实现已在独立仓库main中发布，目前无开放PR；Merge Ready在这里表示验收与交付就绪，不表示执行了新merge、关闭了#38或完成了实物标定。高度复测[#2](https://github.com/David-JA/lab-frame-experimental-geometry/issues/2)和模拟扩展[#3](https://github.com/David-JA/lab-frame-experimental-geometry/issues/3)继续独立跟踪。
