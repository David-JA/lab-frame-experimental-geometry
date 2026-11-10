# SSRF-BL12SW 实验几何工作台

Lab-Frame Experimental Geometry 是面向 **SSRF-BL12SW** 的实验几何工作台：在实验室坐标系中交互查看大样品台、六轴位移台、Z平台、XYθ、样品与探测器，理解嵌套运动和单晶方向。

[在线试用](https://david-ja.github.io/lab-frame-experimental-geometry/) · [提出建议或报告问题](https://github.com/David-JA/lab-frame-experimental-geometry/issues/new/choose) · [查看反馈](https://github.com/David-JA/lab-frame-experimental-geometry/issues)

欢迎老师和试用者反馈尺寸、安装层级、运动读数、交互或实验需求。反馈可附操作步骤、截图或导出的JSON；尺寸请注明单位及对应参考面。维护者根据问题更新Spec、验证实现，再发布更新。网页参数和导入JSON在当前浏览器处理；刷新会重载默认配置，修改请先导出JSON。

本仓库用于承载独立的软件实现，包括装置层级、坐标变换、晶体方向计算和 Three.js 可视化。任务范围与验收由下列 Issue 持有，不在本仓库复制第二份任务台账。

## 任务关联

- [Obsidian #38：单晶衍射实验装置参数化运动学与晶体学三维可视化](https://github.com/David-JA/obsidian/issues/38) — 本工具的需求、G0/G1 验收及阶段状态入口。
- [Parent #32：可校准的单晶衍射虚拟实验平台](https://github.com/David-JA/obsidian/issues/32) — 本工具的上层项目；本工具独立交付，不作为 C0 虚拟采集的前置条件。

## 仓库与发布

- 仓库名称：`lab-frame-experimental-geometry`
- 公开仓库：[David-JA/lab-frame-experimental-geometry](https://github.com/David-JA/lab-frame-experimental-geometry)
- 初始分支：`main`
- GitHub Pages由[发布工作流](./.github/workflows/pages.yml)在main更新后执行测试、构建与部署；工作流失败时不替换线上版本。
- 本次直接发布已审main，不要求创建PR；后续变更按实际反馈决定协作方式。

## 当前状态

2026-11-10：T9高度配置与独立Z平台已提交 `06a6494`。T10图纸尺寸更正和分层配色均通过对应review，现已按用户授权随本次本地提交保存。六轴总高350 mm，大样品台水平截面450×450 mm；亮银六轴、中灰转接板与青绿XYθ用于区分层级。G0/G1正式接受仍待单独决定；图纸包络与粗测不作为实物标定或硬件运动依据。

T11经Astra high评审通过，已在个人账户David-JA建立公开仓库并发布Pages，线上WebGL与参数更新、资源子路径及窄屏布局已核查。欢迎通过[公开试用与反馈 #1](https://github.com/David-JA/lab-frame-experimental-geometry/issues/1)交流；它与Obsidian #38双向关联。源码和原创文档MIT，参考图另列许可边界。

T12坐标诊断与设置语言改进已通过Astra high、Terra high两轮review，以个人账户David-JA推送并更新Pages；线上预设、参数区与窄屏已核查，发布记录见Spec。

当前进度、验证与接受边界由[Spec](./discuss/20261109_issue38_g0_g1_minimal_spec.md)持有；旧handoff已删除，历史版本可从Git查阅。公开试用不等同于G0/G1正式接受。

## 本地开发

使用 Node 24（当前验证 24.17.0）和 npm（当前 11.13.0）：

```sh
git clone https://github.com/David-JA/lab-frame-experimental-geometry.git
cd lab-frame-experimental-geometry
npm ci --ignore-scripts
npm run typecheck
npm test -- --run
npm run build
npm run dev
```

`npm run preview`可本地预览`dist`构建。开发默认使用根路径；Pages工作流通过`PAGES_BASE_PATH`设置仓库子路径，只上传`dist`，使用GitHub Pages的OIDC部署权限，不需要另配个人token。维护者在仓库Settings → Pages选择GitHub Actions；发布过程参考[Vite官方指南](https://vite.dev/guide/static-deploy.html#github-pages)与[GitHub自定义工作流说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

默认只在 `127.0.0.1` 运行；终端会给出本机地址，通常为 `http://127.0.0.1:5173`。合成示例在 `examples/experimental-setup/`，默认卷尺高度配置由 `src/example.ts` 的 `lab_height_config()` 复用它生成；`?example=synthetic` 可直接查看原合成示例。配置抽屉也可分别恢复两者。输入结构在 `schema/setup.schema.json`，纯计算入口为 `src/core/index.ts`。核心不依赖 Three.js、DOM 或 WebGL；UI 与渲染消费同一份场景状态。

## 当前验证与使用边界

- 当前T12的92项测试（61数值/API＋31展示/布局）、typecheck/build通过。10条浏览器流程覆盖均已通过：最新完整运行中9条通过，剩余旧配置说明断言修正后专项通过；随后修复文件/JSON来源分离，相关2条专项再次通过（12.1 s），其余8条有效证据复用。覆盖四个观察预设不改snapshot、非立方方向、两组草稿独立应用、非法参数/JSON拒绝与配置文件来源一致性。既有尺寸、接触面与运动继承回归保留；Astra high、Terra high两轮review均PASS，不等同于G0/G1用户接受。
- `npm run test:e2e`：正常 Windows 用户边界、Edge headless / SwiftShader 下原七条流程、外观流程与实验室高度流程均通过。标签显式检查关键点/方向可见、位于 canvas 内，拖动前后检查 selected id；柱体外观流程验证修改尺寸不改变 assembly/joints/样品位置，零高度原子拒绝。实验室高度流程另验证物理升降、边界拒绝、非零φ与完整snapshot恢复。测试自行启停 `127.0.0.1:4173`，使用 `msedge` channel；其他系统需选择当地可用浏览器。若进程代理为 `socks5:`，仅为测试进程追加 loopback `NO_PROXY`，不修改持久环境。
- 另在真实浏览器人工核查可见实体拾取：点击 XY 上台面归入 θ 宿主，六轴与 φ 的点击同步树/检查器/高亮；旋转、平移、缩放保持选择和物理状态。φ 在露出底面的视角核查，不要求穿透遮挡拾取。该集成视觉证据与 Raycaster/OrbitControls 单测分别保留，不声称七条 E2E 自动执行了全部人工点击。
- 浏览器检查实际 Three.js 世界矩阵、视觉杆端点、C 正交轴原点和 detector 的 D 原点/有效平面；另以中心/目标点分离及 φ/θ 不共轴的配置核对读数。成功测试不等于真实设备校准或实验精度验证。
- 页面提供“全景”“装置近景”“样品近景”，φ/θ 轴有名称及颜色图例。距离读数明确区分样品中心和目标点；C 正交轴位于 C frame 原点，晶格方向示意箭头置于样品中心，目标方向置于目标点。primitive 的尺寸/`visual.offset_mm` 只作用于外观，不改变计算 frame。detector 有效区固定在 D 的 z=0，外壳尺寸另行显示。
- 真实设备参数、UVW 控制器映射、行程、标定及 G2 均未验证。初版未做网络服务、硬件控制或复杂 CAD；T8 构建主 JS 767.76 kB（gzip 202.38 kB），保留 Vite 的体积提示，尚未做按需拆包。

该初版供在线/本地试用与后续验收；#38的G0/G1尚未由用户正式接受。具体覆盖和剩余工作见Spec。

## 装置参数面板

工作台默认“装置近景”、日间配色；“全景”包含独立探测器，“样品近景”便于观察上部平台与晶向。左侧是约 270 px 的装置树和单检查器，树中颜色小块对应设备外观。默认选中 XYθ 一体位移台，共用安装位置并保留 θ/X/Y 行程；安装与几何默认折叠。pivot 在六轴参数中，晶体取向在样品参数中。点击树或可见实体切换设备，XY 子实体归到 θ 宿主。选择、相机、诊断总开关不进 snapshot，原三个 display 开关仍保存。

视口下方常驻带轴误差、目标点到 φ 轴、样品中心到 θ 轴三项读数；reciprocal 模式不冒称 direct 带轴误差。“配置”打开 JSON 导入/导出、比较与恢复，“读数详情”打开详细数值/诊断；恢复示例位于配置内，与相机的“全景/样品近景”操作分开。合成/未标定身份始终独立显示。

安装位置以卡片标出的父坐标系输入，并显示该参考点的 LAB 坐标。默认配置中，大样品台编辑 LAB 内旋转轴参考点；六轴编辑 H0 基座（相对 R）；Z 平台编辑 Z0 下安装面（相对 H1）；XYθ 一体台统一编辑 P0 基座（相对 Z1，合成示例则相对 H1）；样品和探测器分别编辑相对 P2、LAB 的安装点。XY 固定基座与 θ 旋转中心重合，只读显示当前 LAB 位置；X/Y 行程移动的是上方滑台 P2 和样品，不会移动这个基座。

配置通过 XY 设备的 `integrated_into` 引用 θ 设备 id（示例为 `"theta"`），保存/恢复时保留此关系。加载器检查刚性安装链中 XY 零行程基座确实位于 θ 轴中心，允许固定垫片，但拒绝独立基座偏移；不能把运动后的 P2 原点当作基座中心。未声明一体关系的旧配置继续按原独立装配显示，不自动改写其安装参数。

修改安装位置会整体平移对应装配分支，保持关节读数及内部相对装配；大样品台的旋转轴中心和零位mount同时平移，非零φ下也不会误变为偏心调整。运动调整只改变对应关节；改变倾转参考点不等于移动底座。参数区底部常驻“装置说明”，说明运动约定、联动范围与安装坐标。

样品参数先设置“观察哪个方向”：晶向显示u/v/w，晶面法向显示h/k/l；“应用观察方向”只更新目标箭头与读数，不会自动转动样品。四元数编辑折叠在“高级：晶体取向”，“应用晶体取向”只改变晶体相对样品的朝向。两组草稿独立校验，修改方向不受高级取向草稿影响。固定样品不再先显示空的运动区。配置抽屉先提供文件保存/载入，原JSON编辑/比较放在高级折叠区。

配置若将设备直接绑定在 LAB 或派生晶体坐标系上，它没有独立安装 mount，面板显示只读绑定位置；不为此收窄原有合法配置。

本轮核查 1600 px 桌面、1062×956 和 390×844；窄屏视口位于参数之前，向下编辑参数时仍保留观察区域。`artifacts/workbench-{1062,overview,mobile}.png` 由 E2E 刷新；`artifacts/final-picking-{xy,hexapod,phi}.png` 与 `final-reciprocal-mobile.png` 记录最终边线、实体选择和窄屏法向检查。截图在 ignored `artifacts/`，不另存源码版本。

## 参考图外观与高度设置

主体颜色由配置 `visual.color` 驱动。默认大样品台为浅黄 `#F8E68A`，六轴圆盘与支杆为亮银 `#DDE3E8`，上下转接板为中灰金属 `#77818B`；Z平台保留炭黑。XYθ使用同一青绿系列，θ底座 `#3E817B`、XY滑台 `#87B9AC` 以深浅区分内部两级，样品保留棕色；配色用于层级辨认，保留金属材质。装置树色块对应主体配色，选中轮廓与坐标轴颜色独立。

默认六轴按图纸取下盘最大外径348/厚30、上盘直径260/厚18.2 mm；下盘简化为圆盘包络。原合成示例仍为下盘240、上盘180、厚12 mm，保留原主体visual.color；转接板与金属材质采用当前渲染规则。`upper_disc_size_mm`显式配置上盘尺寸，省略时保留原0.75倍直径/同厚度行为。上下外加方板分别附着H1/H0；偏移分别按对应圆盘半厚与转接板半厚相加，边长仍由下盘派生为0.85/1.08倍，是示意值。6根支杆端点/杆径仍为外观示意，不解真实机构。

大样品台的“安装与几何 → 柱体外观 → 高度”修改 `visual.size_mm[1]`，保持当前柱顶平面，通过同步 `visual.offset_mm` 向下延伸柱体；不改变关节、安装 frame、样品或晶体 LAB 位姿，不是升降运动。合成示例整体抬高可改安装 Y；默认实验室配置使用“台面升高”，其安装 Y 共用同一更新逻辑。合成示例柱体 190×180×190 mm，柱顶 y=−18 mm，与六轴下转接板接触；这些尺寸会随 snapshot 保存。

原合成示例的 H1 零位高度为 142.5 mm、H1→P0 高度为 57.5 mm，合计仍 200 mm。上圆盘、转接板、θ、XY 与样品在零位依次接触，样品中心、pivot、beam 和 detector 的合成示例 y=200 不变；示意比例参考用户图片，未从照片测量。截图见 ignored `artifacts/appearance-{apparatus,overview,sample,mobile}.png` 及 `appearance-height-250.png`。

## 实验室高度配置

默认以地面y=0、LAB +Y向上：大样品台450×450×670 mm，台面/六轴下转接板底面约670 mm。图纸六轴本体高320 mm，已含上下圆盘；加外侧各15 mm板后总高350 mm，上转接板顶面约1020 mm。此前460 mm已由用户更正。光束固定约1380 mm；XYθ/样品仍用示意尺寸。来源图纸、内部frame与厂图坐标的区别、后续170 mm支撑架方案见[尺寸与高度记录](./discuss/20261110_lab_height_survey.md)，后续支撑架本轮未装入。

装配链为 `LAB → R → H0 → H1 → Z0 → Z1 → P0 → P1(θ) → P2(XY) → S → C`。黑色 Z 平台下安装面在 Z0，上安装面在 Z1；新增 `prismatic` 关节 `z_stage.z` 沿 Z0 +Z 移动，零姿态对应 LAB +Y，倾转后随六轴方向运动。界面以 cm 输入10–20，snapshot以 mm保存100–200，初值150。上下黑板与简化剪叉便于识别，不计算真实升降架机构。

初值Z平台顶面1170 mm，沿用上方示意尺寸后目标点1209.5 mm，页面常驻显示比光束低170.5 mm，不自动补齐。大样品台“台面升高”范围0–10 cm，通过同步旋转中心、mount、柱体高度和offset带动整个上方装配，柱底保持原地；光束和探测器不随之移动。安装Y使用相同逻辑；此配置的elevation限制按mount变化量校验，其他几何/关节操作继续独立。所有值通过完整snapshot保存恢复，既有合成snapshot仍可导入。

## 三维坐标与标注

坐标轴保留 XYZ 红/绿/蓝约定：设备 frame 为细轴，C 正交轴为实线箭头，直接晶格方向为虚线箭头；φ 使用金色实线、θ 使用紫色虚线，共轴时明确标记“φ / θ 共轴”。目标点与目标方向均为品红色，文字分别标明“目标点”和“目标方向 [uvw] / 目标法向 (hkl)”；pivot 使用灰色空心标记，不再复用 φ 的颜色。

标注为固定12 px屏幕文字；高对比红/绿/蓝表示X/Y/Z，坐标用实线、晶格方向用虚线，观察目标用品红。方向箭头使用实体粗箭杆和更大的箭头；文字采用浅底和相应颜色边标。箭头长度只用于显示，不代表晶格常数。

“坐标与方向”提供四个查看预设：晶体坐标、晶格方向、装置坐标、全部对照，默认先看晶体坐标。前两类隐藏无关装置标记，装置坐标只看当前选择与实验室，全部对照用于工程核查。查看预设仅改变当前画面；原display开关仍随snapshot保存，两者共同决定可见内容，保存图层关闭时给出提示与设置入口。C轴相互垂直，晶格方向一般不互相垂直，两者不混称。

只有真实点和frame原点执行共点归组，短提示可打开对应对象；示意箭头尖端即使同位置也分别标注。布局不移动物理几何、不写入snapshot，视野之外的锚点不贴边冒充可见点。

31 项展示/布局测试覆盖真实共点、方向端点偶合、投影重叠、避让、边界、优先级、展示策略、取景、实际矩阵、拾取、跨帧布局稳定性及复合件接触；浏览器回归检查 DOM 边界、关键标签可见、字号和相机操作不改物理状态。标签保留上一帧仍合法的锚点相对位置（含亚像素），不因左右等距时的像素取整而反复换边；遇越界或碰撞仍重新避让。该偏移只在渲染层使用，不进入 snapshot。`center_s_mm=[-30,0,0]` 时 C X 和 [100] 的示意端点重合仍独立显示，正常原点共点详情也保留。截图包括 `artifacts/labels-*.png`、`final-direction-overlap.png` 和 `device-description-hexapod.png`。中文显式使用 Microsoft YaHei / Noto Sans CJK SC，已核查最终导出。

## 开发方案

[G0/G1 最小实现与验收 Spec](./discuss/20261109_issue38_g0_g1_minimal_spec.md) 按 PWA Basic Spec 模板组织，明确计算核心、Three.js 页面、配置与 Agent 接口的开发顺序和验收方法，并回填实际验证范围。

## 开源许可

源码及原创文档采用[MIT License](./LICENSE)。第三方依赖和用户提供参考图的授权范围见[NOTICE](./NOTICE.md)。
