# SSRF-BL12SW 实验几何工作台

Lab-Frame Experimental Geometry 面向 **SSRF-BL12SW** 的单晶衍射实验，交互展示实验室坐标系中的装置层级、嵌套运动和晶体方向。

[在线试用](https://david-ja.github.io/lab-frame-experimental-geometry/) · [提交问题或建议](https://github.com/David-JA/lab-frame-experimental-geometry/issues/new/choose) · [公开试用与反馈 #1](https://github.com/David-JA/lab-frame-experimental-geometry/issues/1)

## 可以做什么

- 查看大样品台、六轴位移台、Z 平台、XYθ、样品和独立探测器的空间关系。
- 调整运动参数、晶体取向及观察方向，查看对齐误差和距离读数。
- 分别查看晶体坐标、晶格方向或装置坐标，保存、载入和比较配置。

## 开始试用

打开在线工作台，在左侧选择装置并调整参数；使用“装置近景”或“样品近景”查看细节。“坐标与方向”可以切换要看的类型；样品区先设置观察方向，晶体取向放在高级设置中。

运动区可选择一个轴，输入带正负号的速度并点击“开始”；位移用 mm/s、旋转用 °/s。“暂停”保留当前位置，到已配置行程端点也会自动暂停。

标题右侧的“复位”会暂停运动，并将当前装置的全部运动轴回到零位；Z 平台回到最低高度 10 cm。安装基准、pivot 和其他装置的运动读数保留。

参数和导入的 JSON 在当前浏览器处理。刷新会重载默认配置，需要保留修改时，请在“配置”中保存配置文件。

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
| [实施与验收 Spec](./discuss/20261109_issue38_g0_g1_minimal_spec.md) | 需求、任务、阶段状态与验收记录 |
| [尺寸与高度记录](./discuss/20261110_lab_height_survey.md) | 图纸、粗测依据、参考面与更正沿革 |

[Obsidian #38](https://github.com/David-JA/obsidian/issues/38) 持有 G0/G1 正式验收；[Parent #32](https://github.com/David-JA/obsidian/issues/32) 是上层虚拟实验项目。本工具独立交付，公开试用不等于正式接受。

## 许可

源码和原创文档采用 [MIT License](./LICENSE)。第三方依赖与参考图的授权范围见 [NOTICE](./NOTICE.md)。
