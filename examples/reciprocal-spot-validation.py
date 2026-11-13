"""Independent Cartesian pixel-boundary audit and scientific figures.

Run after FORWARD_AUDIT_OUTPUT=artifacts/issue3-forward/validation.json vitest.
Uses scipy quadrature over the physical detector plane; does not import the
production polar-ring integrator. Requires numpy, scipy and matplotlib.
"""
from pathlib import Path
import argparse
import json
import math
import warnings

import numpy as np
from scipy.integrate import quad
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager


def oracle(case, bounds, eps=2e-11):
    """Integrate rho(k*s-ki) k² |n·s| dA/r² over actual raw rectangle.

    A conic intersection with each raw row/column bounds the support before
    adaptive Cartesian quadrature, so a tiny spot cannot fall between samples.
    Gaussian reference cutoff is 10 sigma; omitted spherical tail is <1e-20
    of the on-Ewald scale in these fixtures. Uniform sphere is not truncated.
    """
    panel, im = case["panel"], case["image"]
    source = np.asarray(case["source"], float)
    k = case["k"]
    g = np.asarray(im["g_lab"], float)
    q = g + [0, 0, k]
    c = np.linalg.norm(q)
    axis = q / c
    d = im["density"]
    gaussian = d["kind"] == "gaussian_3d"
    sigma = d.get("sigma_g_invA", 1.)
    radius = 10 * sigma if gaussian else d["radius_g_invA"]
    delta = c-k
    if radius <= abs(delta) or im["W"] == 0:
        return 0., 0.
    t = (radius*radius-delta*delta)/(2*k*c)
    mu = 1-t
    assert mu > 0, "Audit fixtures require a forward compact cap"
    beta2 = t*(2-t)/(mu*mu)
    F = np.column_stack((np.array(panel["x"])*panel["pixel_size_mm"][0],
                         -np.array(panel["y"])*panel["pixel_size_mm"][1]))
    base = np.asarray(panel["center"])-source
    offsets = (np.array(panel["pixels"])-1)/2
    af = axis @ F
    perpF = F - np.outer(axis, af)
    perpbase = base-axis*np.dot(axis, base)
    A = perpF.T @ perpF - beta2*np.outer(af, af)
    b = perpF.T @ perpbase-beta2*np.dot(axis, base)*af
    centre = -np.linalg.solve(A, b)
    rcentre = base+F@centre
    perpcentre = rcentre-axis*np.dot(axis, rcentre)
    size = beta2*np.dot(axis, rcentre)**2-np.dot(perpcentre, perpcentre)
    if size <= 0:
        return 0., 0.
    invA = np.linalg.inv(A)
    rawcentre = centre+offsets
    hu = math.sqrt(size*invA[0, 0])
    u0,u1,v0,v1 = bounds
    low,high = max(u0,rawcentre[0]-hu),min(u1,rawcentre[0]+hu)
    if low >= high:
        return 0., 0.
    # Split at every horizontal rectangle/conic intersection. Within each
    # interval the vertical limits are smooth, independent of production rings.
    cuts = [low,high]
    for v in (v0,v1):
        y = v-rawcentre[1]
        D = A[0,1]**2*y*y-A[0,0]*(A[1,1]*y*y-size)
        if D >= 0:
            for sign in (-1,1):
                u = rawcentre[0]+(-A[0,1]*y+sign*math.sqrt(D))/A[0,0]
                if low < u < high:
                    cuts.append(u)
    cuts=sorted(set(cuts))
    coef = im["W"]/((2*math.pi)**1.5*sigma**3) if gaussian else 3*im["W"]/(4*math.pi*radius**3)
    normal = np.asarray(panel["normal"])
    pxpy = np.prod(panel["pixel_size_mm"])
    inner_errors=[]

    def outer(u):
        x = u-rawcentre[0]
        disc = A[0,1]**2*x*x-A[1,1]*(A[0,0]*x*x-size)
        if disc <= 0:
            return 0.
        h = math.sqrt(disc)
        vl=max(v0,rawcentre[1]+(-A[0,1]*x-h)/A[1,1])
        vh=min(v1,rawcentre[1]+(-A[0,1]*x+h)/A[1,1])
        if vl >= vh:
            return 0.
        r0 = base+F[:,0]*(u-offsets[0])
        def integrand(v):
            r = r0+F[:,1]*(v-offsets[1])
            length=np.linalg.norm(r)
            s=r/length
            r2=delta*delta+k*c*np.dot(s-axis,s-axis)
            rho=coef*math.exp(-r2/(2*sigma*sigma)) if gaussian else coef
            return rho*k*k*abs(np.dot(normal,r))*pxpy/length**3
        value,err=quad(integrand,vl,vh,epsabs=eps*im["error_scale"]/max(1.,high-low),epsrel=eps,limit=150)
        inner_errors.append(err)
        return value
    value,error=0.,0.
    for l,r in zip(cuts,cuts[1:]):
        # sin² maps the conic square-root endpoints to a smooth interval.
        def smooth(z):
            return outer(l+(r-l)*math.sin(z)**2)*(r-l)*math.sin(2*z)
        val,err=quad(smooth,0,math.pi/2,epsabs=eps*im["error_scale"]/max(1,len(cuts)-1),epsrel=eps,limit=150)
        value+=val;error+=err
    return value,error+max(inner_errors,default=0.)*(high-low)


def tile_value(image,u,v):
    tile=image["tile"]
    i,j=u-tile["u0"],v-tile["v0"]
    return tile["data"][j*tile["width"]+i] if 0<=i<tile["width"] and 0<=j<tile["height"] else 0.


def validate(data):
    rocking_refs=[]
    for group in data["A1"]:
        for case in group["representatives"]:
            im,panel=case["image"],case["panel"]
            ref,err=oracle(case,[-.5,panel["pixels"][0]-.5,-.5,panel["pixels"][1]-.5])
            assert err<=1e-8*im["error_scale"]
            assert abs(ref-im["pixel_sum"])<=1e-3*ref+1e-6*im["error_scale"]
            rocking_refs.append({"kind":group["kind"],"offset_deg":case["offset_deg"],"J":im["sphere_integral"],"pixel_sum":im["pixel_sum"],"board_reference":ref,"board_reference_error":err,"peak_scale":group["fit"]["peak"]})
    refs=[]
    for group in data["A2"]:
        for case in group["cases"]:
            im,panel=case["image"],case["panel"]
            ref,err=oracle(case,[-.5,panel["pixels"][0]-.5,-.5,panel["pixels"][1]-.5])
            scale=im["error_scale"]
            assert err <= 1e-8*scale,("board reference error",err/scale)
            assert abs(ref-im["pixel_sum"]) <= 1e-3*ref+1e-6*scale
            pixels=[]
            for u,v in case["selectedPixels"]:
                val,error=oracle(case,[u-.5,u+.5,v-.5,v+.5])
                tighter,tighter_error=oracle(case,[u-.5,u+.5,v-.5,v+.5],eps=5e-12)
                assert error<=1e-9*scale and tighter_error<=1e-9*scale
                assert abs(val-tighter)<=1e-9*scale
                got=tile_value(im,u,v)
                assert abs(got-tighter)<=1e-3*tighter+1e-8*scale,(group["density"],case["target"],u,v,got,tighter)
                pixels.append({"u":u,"v":v,"raw":got,"reference":tighter,"oracle_error":tighter_error,"refinement_delta":abs(val-tighter)})
            refs.append({"kind":group["density"]["kind"],"target":case["target"],"J":im["sphere_integral"],"pixel_sum":im["pixel_sum"],"board_reference":ref,"board_reference_error":err,"retained":ref/im["sphere_integral"] if im["sphere_integral"] else None,"reference_lost":im["sphere_integral"]-ref,"actual_lost":im["sphere_integral"]-im["pixel_sum"],"pixels":pixels})
    return {"A1":rocking_refs,"A2":refs}


def image_grid(image,bounds):
    u0,u1,v0,v1=bounds
    return np.array([[tile_value(image,u,v) for u in range(u0,u1+1)] for v in range(v0,v1+1)])


def figures(data,refs,out):
    font=font_manager.findfont(font_manager.FontProperties(family=["Microsoft YaHei","Noto Sans CJK SC"]),fallback_to_default=False)
    plt.rcParams.update({"font.family":font_manager.FontProperties(fname=font).get_name(),"axes.unicode_minus":True,"figure.dpi":140})
    fig,axes=plt.subplots(1,3,figsize=(15,4),layout="constrained")
    for group in data["A1"]:
        name="三维高斯" if group["kind"]=="gaussian_3d" else "均匀球"
        x=[r["offset_deg"] for r in group["scalar"]];J=[r["J"] for r in group["scalar"]];values=[r["pixel_sum"] for r in group["scalar"]]
        axes[0].plot(x,J,label=name+"：独立球面积分")
        axes[0].plot(x[::4],np.array(values)[::4],".",label=name+"：原始像素和")
        axes[1].plot(x,np.array(values)/group["fit"]["peak"],label=name)
        references=[r for r in refs["A1"] if r["kind"]==group["kind"] and abs(r["offset_deg"])<.2]
        axes[0].plot([r["offset_deg"] for r in references],[r["board_reference"] for r in references],"x",label=name+"：独立板内参照")
        axes[2].plot(x,(np.array(values)-np.array(J))/group["fit"]["peak"],label=name+"：像素和−球面")
        axes[2].plot([r["offset_deg"] for r in references],[(r["pixel_sum"]-r["board_reference"])/r["peak_scale"] for r in references],"x",label=name+"：像素和−板内参照")
    axes[0].set(xlabel="相对峰中心 ψ / °",ylabel="原始相对积分信号",title="同一三维总量，匹配 0.10° rocking FWHM")
    axes[1].set(xlabel="相对峰中心 ψ / °",ylabel="仅曲线比较：各自峰值归一化",title="峰翼不同；原始图像不逐帧归一化")
    axes[1].axhline(.1,color="gray",linestyle="--",linewidth=.8)
    axes[2].set(xlabel="相对峰中心 ψ / °",ylabel="差值 / 独立峰值尺度",title="实际数值误差（非实验误差条）")
    for ax in axes:ax.legend(fontsize=8);ax.grid(alpha=.2)
    fig.savefig(out/"rocking.png");plt.close(fig)
    fig,axes=plt.subplots(2,7,figsize=(16,6),layout="constrained")
    fixed_max=max(g["fit"]["peak"] for g in data["A1"])/2
    tiles=[r["image"]["tile"] for group in data["A1"] for r in group["representatives"] if r["image"]["tile"]["width"]>0]
    bounds=(min(t["u0"] for t in tiles),max(t["u0"]+t["width"]-1 for t in tiles),min(t["v0"] for t in tiles),max(t["v0"]+t["height"]-1 for t in tiles))
    for row,group in enumerate(data["A1"]):
        reps=group["representatives"];vmax=fixed_max
        for ax,rep in zip(axes[row],reps):
            a=image_grid(rep["image"],bounds)
            ax.imshow(a,cmap="gray",vmin=0,vmax=vmax,origin="upper",extent=(bounds[0]-.5,bounds[1]+.5,bounds[3]+.5,bounds[2]-.5))
            ax.set_title(f'{"高斯" if row==0 else "均匀球"} ψ 偏移\n{rep["psi_deg"]-group["fit"]["centre"]:+.3f}°',fontsize=9)
            ax.set(xlabel="raw 列 / px",ylabel="raw 行 / px")
    fig.suptitle("全部帧使用同一灰度上限；外侧帧为支持外或低于尾预算，内侧含各自 10% 峰翼")
    fig.savefig(out/"frames.png");plt.close(fig)
    fig,ax=plt.subplots(figsize=(7,4),layout="constrained")
    for kind in ("gaussian_3d","uniform_sphere_3d"):
        rows=[r for r in refs["A2"] if r["kind"]==kind]
        ax.plot([r["target"][0] for r in rows],[r["retained"] for r in rows],"o-",label="高斯" if kind=="gaussian_3d" else "均匀球")
    ax.axvline(80.5,color="gray",linestyle="--",label="板边 raw u=80.5")
    ax.set(xlabel="斑点中心 raw 列 / px",ylabel="独立板内保留比例",title="同一反射只平移面板：完整接收与真实裁切损失",xlim=(79.8,81.7),ylim=(-.03,1.03));ax.legend();ax.grid(alpha=.2)
    fig.savefig(out/"edge.png");plt.close(fig)
    raw=data["A3"]["raw"];u0,v0=raw["u0"],raw["v0"];u1,v1=u0+raw["width"]-1,v0+raw["height"]-1
    grids=[np.array(raw[name]).reshape(raw["height"],raw["width"]) for name in ("first","second","combined")];vmax=max(a.max() for a in grids)
    fig,axes=plt.subplots(1,3,figsize=(10,3.7),layout="constrained")
    for ax,a,title in zip(axes,grids,["单反射 (200)","单反射 (202)","线性合成；同一标尺"]):
        ax.imshow(a,cmap="gray",vmin=0,vmax=vmax,extent=(u0-.5,u1+.5,v1+.5,v0-.5));ax.set(title=title,xlabel="raw 列 / px",ylabel="raw 行 / px")
    fig.savefig(out/"overlap.png");plt.close(fig)
    return font


if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("input",type=Path);args=parser.parse_args()
    data=json.loads(args.input.read_text(encoding="utf-8"));out=args.input.parent
    refs=validate(data)
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        font=figures(data,refs,out)
    glyph_warnings=[str(w.message) for w in caught if "Glyph" in str(w.message)]
    assert not glyph_warnings,glyph_warnings
    report={"status":"PASS","method":"Independent scipy Cartesian detector-plane quadrature; production uses polar ring arcs","font":font,"cases":refs,"glyph_warnings":glyph_warnings}
    (out/"independent-reference.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(f'Independent audit PASS: {len(refs["A1"])} rocking reference frames, {len(refs["A2"])} board cases, {sum(len(r["pixels"]) for r in refs["A2"])} pixel references; font: {font}')
