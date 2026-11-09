# Obsidian #38：G0/G1 最小实现方案与验收 Spec

Status: Active
Issue: [Obsidian #38](https://github.com/David-JA/obsidian/issues/38)
Created: 2026-11-09
Decision owner: Maintainer

## Goal and scope

为 Lab-Frame Experimental Geometry 建立可直接指导 G0/G1 开发的最小合同：在统一 LAB 坐标系中，以参数驱动真实的装配层级，计算设备位姿与晶体方向，并通过本地 Three.js 页面和程序接口消费同一份状态。

2026-11-09 完成 Spec 与 README 导航；2026-11-10 获用户明确授权，开始按本合同推进本地实现。实施结果仅在 Tasks/Outcome 回填；设计评审通过不等于 #38 的实现验收。

首期包含固定装配、φ、六轴 XYZ/UVW、θ→XY、样品/晶体、独立探测器和光束、配置加载、状态保存恢复与比较、基础查询及界面。G2 的衍射交点、运动序列回放、交互拾取测量、更多设备导入，以及自动对准、硬件控制、真实支链求解均不纳入。

## Current evidence

- 设计时的本地源码基线仅含 README；仓库独立、无远端、无 PR，没有可复用的本项目运动学实现。
- #38 已明确 `LAB→R→H0→H1→P0→P1(θ)→P2(XY)→S→C`；θ 在下、XY 在上由用户最终确认，不再作为待选方案。
- #38 要求 `+Y_lab` 向上、`+Z_lab` 入射、右手系、列向量变换；hexapod 变换须包含零位安装 `T0`。C 是正交笛卡尔 frame，直接晶格基矢 A 不必正交。
- 实测设备尺寸、安装 pose、控制器 UVW 映射、行程及晶体取向文件尚未提供。本 Spec 可以形成合成场景的正确性闭合，不宣称真实装置校准或运动可执行性。
- PWA 的 [Spec workflow](../../pwa1483_1d_scan_stress/docs/workflows/discuss_spec_workflow.md) 与 [Basic 模板](../../pwa1483_1d_scan_stress/docs/workflows/spec_template_basic.md) 作为结构参考，读取时本地版本为 `350f3cd5661a90fb0a00c7f50286a7b856892e99`。选择 Basic 单文件：需求与有序开发属于一个有界交付，无已确定的长期、多 PR 或高频执行记录，不满足 Split 的同时条件。
- 不将 PWA 的材料 baseline、数据目录、双语全套文档或 PR/merge 流程复制到新仓库；这里只采用“先稳定合同、再列方案/任务/验证”的组织方式。PWA 生成器固定其仓库根，因此按模板在本仓撰写，不调用它向 PWA 写文件。

## Required deliverables

**本轮：** 本 Spec 与 README 的可达入口；设计审阅在任务聊天留存 reviewer、审查版本、scope、verdict 及 findings，不在 Spec 维护逐轮日志。

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
7. 保留本地 Git，不推送、不建 PR。2026-11-10 的用户授权允许实施、安装所选项目依赖，并在必要节点经 Astra/Terra 双 review 通过后本地提交；不扩张到真实仪器或 G2。

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
- Selected: 一个 npm 项目；TypeScript + Vite + Three.js，原生 HTML 表单，不引入 UI 框架。Ajv 检查 JSON Schema；Vitest 做无浏览器数值/API 测试；Playwright 只承担三条用户闭环。
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
- 装配仅一棵 LAB 根 frame 树。每条边有 `frame_id,parent_frame_id,mount,motion`；motion 仅支持 fixed、revolute、six_dof、xy_translation。图允许新增这些类型的实例，不承诺通用机构。

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

默认例子只是可复算演示，非真实测量。机械尺寸与 mount provenance 均写为 synthetic：

| 对象 | 零位定义 |
|---|---|
| LAB/R/H0 | φ 轴过 LAB 原点、方向 +Y；R 与 H0 的零位 mount 为 identity |
| H1 | `T0=Trans(0,100,0) mm`；c_H=(0,200,0) mm；t/UVW=0 |
| P0 | 相对 H1：`Trans(0,100,0) Rx(−90°)` |
| P1/P2/S/C | 零位 identity；θ 轴为 P0 的 +Z；XY 为 P1 的 +X/+Y |
| 样品 | center/target=(0,0,0) in S；默认晶体 cubic a=b=c=3.5 Å，R_SC=I，目标 [001] |
| detector/beam | D 原点=(0,200,1000) mm、R=I；beam 过 (0,200,0) mm 沿 LAB +Z |

因此零位样品中心在 LAB (0,200,0)，θ 与 φ 轴都经过该点，c_H 与该点重合，默认 [001] 映到 LAB +Y。这给出不依赖真实设备参数的理想基准。修改 state 的 XY 或 orientation 即可构造偏心、偏轴用例，不复制整套配置。

简化外观支持圆盘/平板、双平面与 3 根视觉杆、θ 台、XY 滑台、夹具及圆柱/方柱/长方体样品。尺寸来自 device visual 参数；圆柱局部轴显式映到样品 S 的 +Z，不能沿用 primitive 默认轴而误标晶体方向。杆的 base 端在 H0、moving 端在 H1，先转换到同一坐标系再画。

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

- `devices.json`：设备 id/type、output_frame、visual 尺寸、样品 cell/center/target 及每个参数的 provenance。
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

左侧设备/坐标显示开关，中间 3D 场景，右侧原生参数表单和读数即可。包含：

- φ、hexapod XYZ/UVW 与 pivot XYZ、θ、XY；样品 R_SC、目标索引及 direct/reciprocal 类型输入。非法输入标出字段，维持最后合法场景。
- mount、轴定义、尺寸及 cell 可通过结构化配置 JSON 编辑/导入后一次性应用，不要求完整拖拽装配编辑器；提供默认示例恢复。
- LAB/设备局部轴、C 正交轴和晶格方向的独立显隐；样品中心、target、pivot、θ/φ 轴显式可辨，beam 与 detector 不随台运动。
- 相机旋转/缩放/复位；参数提交后下一次渲染使用更新后的完整 revision，不以固定 FPS 作本期验收承诺。
- 保存为 JSON；导入文件后可选择“与当前状态比较”或“恢复”。比较摘要显示 joint 差值、设备 LAB 位姿变化、目标方向及配置变化标记，比较本身不改变场景；无需双视图或轨迹回放。读数可直接抄录或由 API 获取，Agent 可通过模块直接调用，无需观看图片或依赖浏览器全局变量。
- 场景若无 WebGL，明确报告无法显示；无渲染 API/数值测试继续可用，但不能因此宣称可视化验收通过。

## Tasks

以下为实施顺序；勾选表示对应实现范围已交付，不代表整个 G0/G1 已接受。

- [x] **T1 工程入口与配置合同**：建立最小 npm/TS/Vite 工程、锁文件、ignore、Schema 与合成输入；交付 typecheck/test/build 命令。
- [x] **T2 独立运动学**：实现有限数学、frame 图、φ、T0/pivot、θ→XY 与 world 查询；V01–V05/V09 的核心数值部分通过，渲染关联由 T4 验证。
- [x] **T3 晶体学与 snapshot/API**：实现 cell/A、R_SC、直接/倒易方向、轴线/距离及场景实例 API（含状态比较），完成 V06–V11 和 V13 的无渲染验证。
- [x] **T4 G0 可视化**：以核心输出驱动 Three.js，简化设备/杆/beam/detector、局部轴与可配置 mount；实际世界矩阵、杆端点和 detector 有效平面对照通过，已形成三维初版。
- [x] **T5 G1 交互**：接入全部表单、方向/中心读数、JSON 导入导出及状态比较摘要，三条浏览器闭环通过；UI 复用核心计算。
- [ ] **T6 验证与交付说明**：全套验收、浏览器检查、README 命令/限制、必要依赖与示例来源；独立最终实现评审后，再按实际结果请求 G0/G1 接受。

T2/T3 的部分测试可在类型/配置合同稳定后独立开展，但渲染依赖相应核心结果。只在实物参数到位时增加“实物配置核对”这一独立验证，不阻塞合成场景实现，也不把它冒充已完成。

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
| V12 浏览器闭环 | 页面加载；偏心→对中→θ；取向→φ；导出→修改→比较→恢复 | 三条流程 UI 与 API 同 revision；比较显示已知差异且不改变 revision，恢复后回到保存状态；数值 inspector/CPU matrixWorld 符合核心；无未处理 console error；实际 canvas 可见且各 marker/轴不误标 |
| V13 两状态比较 | 比较 A=A；5.3 零位 A 与 xy.x=1 mm 的 B；再比较 φ=90°、仅 R_SC 绕目标 [001] 旋转90°、配置变化或不匹配 ID 的状态 | 同状态全部物理差异为零；B−A 的 joint delta=+1 mm、sample translation_delta_lab_mm=(1,0,0)，目标方向差0°；φ=90° 时 sample 旋转差90°而 [001]方向差0°、detector 不变；仅 R_SC 绕 [001] 旋转90°时，joints、机械 S 位姿及目标方向差均为零，crystal_rotation_delta_deg=90°；尺寸/cell 改变须 configuration_changed=true；ID/拓扑不匹配明确拒绝且当前 scene 不变 |

浏览器数值检查复用 V01–V11 预期，不用截图像素差作物理判据；独立人工看一次示例的层级、杆、晶轴标注和中文/负号/数学符号。页面中文明确使用可用的 Microsoft YaHei 或 Noto Sans CJK SC，不能依赖日/韩字体替代。自动测试只等 revision/条件满足，不固定 sleep。Playwright/WebGL 不可用时记录缺口，不能将页面部分标为通过。

命令：`npm ci --ignore-scripts`、`npm run typecheck`、`npm test -- --run`、`npm run build`，以及 `npm run test:e2e`；本地预览用 `npm run dev -- --host 127.0.0.1`。首次创建锁文件使用安装命令，之后复验才用 ci。未执行的命令不得被报告为通过；浏览器测试入口在 T4/T5 落地。

## Outcome

2026-11-10：T1–T3 的独立核心已实现。Node 24.17.0 / npm 11.13.0；锁定 Vite 8.3.7、Vitest 5.1.0、Three.js/@types/three 0.187.0、Ajv 8.20.0（均 MIT），TypeScript 7.0.2 与 Playwright 1.65.0（Apache-2.0）。依赖安装禁用 lifecycle scripts。

无渲染数值/API 测试 43 项、`typecheck` 与实际三维应用 `build` 通过。加载器拒绝非法运动祖先、跟随运动的探测器、缺失像素参数和偏离 +Z 的入射方向，并保留合法固定支架链。

T4/T5 已形成可交互初版，V04/V12 的三条浏览器流程在正常 Windows 用户边界、Edge headless / SwiftShader 下通过。实际 Three.js matrixWorld、杆两端、C 正交轴原点及 D 原点/有效平面的偏差均受测试约束；补充中心/目标点分离、φ/θ 不共轴配置，确认中心到 θ 轴、目标点到 φ 轴及各自到 pivot 的读数。轴线有名称与颜色图例；C 正交轴以 C 原点为起点，晶格示意箭头置于样品中心。页面截图已核查全景/近景、中文、负号与数学符号，Windows Microsoft YaHei 可用。沙箱首次 browser-run 长时间无新输出，已中断并核查无本任务遗留进程；正常用户边界的成功结果不反推沙箱通过。

实现细化：为独立测试补入 `@types/node 24.19.2`（MIT）；`visual.offset_mm` 是可配置的外观锚点，不进入机械 frame；detector 有效区在 D 的 z=0、外壳在其后方；C 正交箭头不与通用 frame 开关混为一组。固定依赖与源码由 Git 持有，截图位于 ignored `artifacts/`。

当前 G0/G1 仍待用户对实际初版接受，T6 的最终接受/后续处置尚未闭合；实物参数/标定与 G2 未执行。单包约732 kB（gzip约190 kB）的构建体积提示保留，不以隐藏告警替代优化。评审记录由任务聊天持有。

## Durable outcome

- [ ] 实施后将真实启动/测试命令、配置入口和适用限制更新到 README；不复制第二套 Issue 验收台账。
- [ ] 仅在出现新的稳定规则或直接使用需求时增加其他文档；本轮不预建 AGENTS、PROJECT_MEMORY、CHANGELOG 或独立执行 ledger。

README 随真实实施结果更新。此文继续保留于 discuss，承担当前实施合同；Active 来自用户实施授权，只有阶段结果按验收闭合后才可标 Done。

## Closeout

- [ ] T1–T6 实施结果、设计偏差、验证结果及剩余工作已回填或明确分流。
- [ ] README 的实际命令与限制已同步，G0/G1 的接受范围可核查。
- [ ] 实施后由用户决定是否继续作为当前合同保留或归档；不因本轮 Spec 交付而归档、不宣称 Merge Ready，也不创建 PR/远端。
