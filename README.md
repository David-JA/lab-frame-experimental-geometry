# SSRF-BL12SW 实验几何工作台

Lab-Frame Experimental Geometry 面向 **SSRF-BL12SW** 的单晶衍射实验，交互展示实验室坐标系中的装置层级、嵌套运动和晶体方向。

[在线试用](https://david-ja.github.io/lab-frame-experimental-geometry/) · [提交问题或建议](https://github.com/David-JA/lab-frame-experimental-geometry/issues/new/choose) · [公开试用与反馈 #1](https://github.com/David-JA/lab-frame-experimental-geometry/issues/1)

## 可以做什么

- 查看大样品台、六轴位移台、Z 平台、XYθ、样品和独立探测器的空间关系。
- 调整运动参数、晶体取向及观察方向，查看对齐误差和距离读数。
- 分别查看晶体坐标、晶格方向或装置坐标，保存、载入和比较配置。
- 展开右侧“衍射预览”，随当前姿态查看理想单晶的预测斑点与 HKL；调整能量、晶格常数和倒易斑点直径。

## 开始试用

打开在线工作台，在左侧选择装置并调整参数；使用“装置近景”或“样品近景”查看细节。“坐标与方向”可以切换要看的类型；样品区先设置观察方向，晶体取向放在高级设置中。

运动区可选择一个轴，输入带正负号的速度并点击“开始”；位移用 mm/s、旋转用 °/s。“暂停”保留当前位置，到已配置行程端点也会自动暂停。

标题右侧的“复位”会暂停运动，并将当前装置的全部运动轴回到零位；Z 平台回到最低高度 10 cm。安装基准、pivot 和其他装置的运动读数保留。

参数和导入的 JSON 在当前浏览器处理。刷新会重载默认配置，需要保留修改时，请在“配置”中保存配置文件。

探测器换距或横移：在左侧选择“探测器支撑架”，展开“固定位置”，修改 LAB 下的 Z 或 X 坐标。平板随架移动，保留标定倾角与安装偏移；右侧“受照体积重心到平板的垂直距离”使用当前衍射图的发射重心计算，随样品运动和照明变化更新；没有可用重心时显示“—”。固定标定参考距离保留在折叠的“参照参数与示例”中。

衍射预览默认收起，运动中每秒更新一次，暂停后立即更新最终姿态；手动修改参数立即更新，收起后停算。这是瞬时采样，快速旋转时可能错过很短暂的反射。

圆斑用黑底灰度显示，越亮表示几何响应越强；选中轮廓不改变灰度。这仍是均匀圆斑示意，高斯图样及真实实验强度预测的后续讨论见 [#3](https://github.com/David-JA/lab-frame-experimental-geometry/issues/3)。

主参数区可直接编辑“晶格常数 a / Å”；立方晶胞会联动 a=b=c，并重算晶面间距和衍射图。高级区可选择 hkl，查看只读的 d、当前能量对应的理论散射角 2θ 和 q=2π/d。衍射预览标题旁的“复位”恢复默认预览参数，保留装置位置与晶体取向。

默认实验室配置借用四月能量、晶格参考及探测器标定，装置高度仍是粗测与示意。当前基础台面770 mm、Z平台20 cm、六轴Y为+20.5 mm，使样品中心与1380 mm光束等高；各装置高度仍待[复测 #2](https://github.com/David-JA/lab-frame-experimental-geometry/issues/2)。

已照到样品也可能暂时没有反射满足衍射条件：在当前理想立方取向下，φ调到约2.01915°可查看 `(200)`。未照到时，面板会显示实际中心偏差和照明模型尺寸；棕色外形为独立示意。也可以显式载入“理想对中示例”。亮度只表示几何响应，不代表真实计数；示例和输入说明见[衍射预览 Spec](./docs/archive/20261111_diffraction_preview_spec.md)。

当前为研究试用版本。简化模型、图纸包络与卷尺数据不替代实物标定，也不构成硬件运动许可。

## 本地运行

需要 Node.js 24 或更高版本，以及 npm。

```sh
git clone https://github.com/David-JA/lab-frame-experimental-geometry.git
cd lab-frame-experimental-geometry
npm ci --ignore-scripts
npm run dev
```

开发服务仅绑定本机，通常为 <http://127.0.0.1:5173/>。测试、构建及 Pages 发布方式见[项目维护记忆](./docs/project_memory.md)。

## 反馈

欢迎老师和试用者通过上方反馈入口提出尺寸、安装关系、运动读数、交互或实验需求。请尽量说明现象和期望行为；可附步骤、截图或导出的 JSON，尺寸请注明单位和参考面。

维护者会先澄清需求、更新 Spec 和必要验收，再验证并发布更新。

## 文档导航

| 文档 | 用途 |
|---|---|
| [项目维护记忆](./docs/project_memory.md) | 架构、实现约定、维护注意事项及验证入口 |
| [已验收 Spec 归档](./docs/archive/README.md) | 已完成阶段的需求、评审与正式接受记录 |
| [G0/G1 Spec](./docs/archive/20261109_issue38_g0_g1_minimal_spec.md) | 装配、运动学与晶体学；已正式接受，登记 Merge Ready |
| [衍射预览 Spec](./docs/archive/20261111_diffraction_preview_spec.md) | 实时理想单晶首版；已完成并归档 |
| [尺寸与高度记录](./discuss/20261110_lab_height_survey.md) | 图纸、粗测依据、参考面与更正沿革 |

[Obsidian #38](https://github.com/David-JA/obsidian/issues/38) 持有 G0/G1 正式验收，Maintainer 已于2026-11-11确认通过并授权登记 Merge Ready。[Parent #32](https://github.com/David-JA/obsidian/issues/32) 是上层虚拟实验项目。本轮接受不等于实物尺寸标定或后续扩展完成。

## 许可

源码和原创文档采用 [MIT License](./LICENSE)。第三方依赖与参考图的授权范围见 [NOTICE](./NOTICE.md)。
