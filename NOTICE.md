# 许可与参考资料

本项目源码及原创文档采用 [MIT License](./LICENSE)。依赖软件分别遵循其自身许可。

[六轴尺寸参考图](./discuss/assets/hexapod-dimension-drawing.png)由维护者提供用于核对包络尺寸，来源型号、作者及版次尚未核实；它不属于本项目原创内容，不纳入本项目MIT授权，原权利人的权利保持不变。尺寸引用与简化模型的关系见[尺寸记录](./discuss/20261110_lab_height_survey.md)。

## ReciPro 衍射模型参考

`src/diffraction/model.ts` 的有限倒易球局部截面与 excitation-only 思路参考 [ReciPro](https://github.com/seto77/ReciPro/tree/87af9715ffbb6d1199b2471caf01f1f7af3983b7) 的 `ReciPro/DiffractionSimulator/FormDiffractionSimulator.cs`。本项目使用 TypeScript 实现，并转换单位与坐标；不分发上游动态库、桌面界面或第三方散射因子数据库。上游 MIT 声明保留如下：

MIT License

Copyright (c) 2002-2026 Yusuke SETO

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


## 在线数学排版

衍射预览按需从 jsDelivr 加载 KaTeX 0.19.1 的脚本、样式和字体；应用构建不包含这些运行资源。KaTeX 采用 MIT License，版权为 Khan Academy and other contributors；具体声明随 CDN 资源及开发依赖分发，开发依赖保留其原始 LICENSE。
