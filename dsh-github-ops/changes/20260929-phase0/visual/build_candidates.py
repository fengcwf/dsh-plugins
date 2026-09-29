#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Phase 2.5 视觉 Spike：「GitHub 集成」设置栏目 3 张候选设计参考图（SVG -> PNG）。
色板唯一来源 = dsh web GUI 设计 token（dsh-client-ui-theme 的 --dsw-* 体系，浅色主题解析值）。
圆角/字号/间距同样取自 --dsw-radius-* / --dsw-font-* / 同生态插件（wiki-steward）惯例。
"""
import math, subprocess, os

OUT = os.path.dirname(os.path.abspath(__file__))
FONT = "Noto Sans CJK SC, sans-serif"
MONO = "DejaVu Sans Mono, monospace"

# ── dsw token 解析值（light）─────────────────────────────────────────────
BG_BASE   = "#ffffff"   # --dsw-alias-bg-base = neutral-bluish-00
PLATFORM  = "#f5f6f7"   # --dsw-alias-bg-module-platform = neutral-bluish-60
SURFACE   = "#ffffff"   # --dsw-alias-bg-layer-1 = neutral-bluish-00
L1        = "#0000000a" # --dsw-alias-border-l1
L2        = "#0000001a" # --dsw-alias-border-l2
L3        = "#0000001f" # --dsw-alias-border-l3
TEXT      = "#0f1115"   # --dsw-alias-label-primary = neutral-bluish-1000
TEXT2     = "#61666b"   # --dsw-alias-label-secondary = neutral-bluish-700
TEXT3     = "#81858c"   # --dsw-alias-label-tertiary = neutral-bluish-600
TEXT4     = "#adb2b8"   # --dsw-alias-label-caption = neutral-bluish-400
BRAND     = "#4176e6"   # --dsw-alias-state-business-primary = deepseek-500
BRAND_BG  = "#e4edfd"   # --dsw-static-deepseek-100
BRAND_FG  = "#34415b"   # --dsw-static-deepseek-800
OK        = "#22c55e"   # --dsw-alias-state-success-primary = green-500
OK_BG     = "#e6faed"   # --dsw-alias-state-success-tertiary = green-100
OK_FG     = "#233c2c"   # --dsw-static-green-900
WARN      = "#f59e0b"   # --dsw-alias-state-warn-primary = amber-500
WARN_BG   = "#fef5e7"   # --dsw-alias-state-warn-tertiary = amber-100
WARN_FG   = "#27241f"   # --dsw-static-amber-900
ERR       = "#ec1313"   # --dsw-alias-state-error-primary = red-600
ERR_BG    = "#fef2f2"   # --dsw-static-red-50
ERR_LINE  = "#fee2e2"   # --dsw-static-red-100
ERR_FG    = "#570c0c"   # --dsw-static-red-900
# 圆角：--dsw-radius-xs 4 / sm 8 / md 12 / lg 16
R_XS, R_SM, R_MD = 4, 8, 12


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def tw(s, size, mono=False):
    """粗略文本宽度：CJK 1.0em，拉丁/数字 0.55em，空格 0.3em；mono 拉丁按 0.6em。"""
    w = 0.0
    for ch in s:
        o = ord(ch)
        if ch == " ":
            w += 0.30
        elif o > 0x2E80:
            w += 1.0
        elif ch in ".,:'|·/":
            w += 0.32
        else:
            w += 0.60 if mono else 0.55
    return w * size


class C:
    def __init__(self, w):
        self.w = w
        self.parts = []
        self.maxy = 0

    def _t(self, y):
        self.maxy = max(self.maxy, y)

    def rect(self, x, y, w, h, fill=SURFACE, stroke=None, rx=0, sw=1):
        s = f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{rx}" fill="{fill}"'
        if stroke:
            s += f' stroke="{stroke}" stroke-width="{sw}"'
        self.parts.append(s + "/>")
        self._t(y + h)

    def line(self, x1, y1, x2, y2, color=L2, sw=1):
        self.parts.append(
            f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="{sw}"/>')
        self._t(y2)

    def text(self, x, y, s, size=13, color=TEXT, weight=None, mono=False, anchor="start"):
        fam = MONO if mono else FONT
        a = f' text-anchor="{anchor}"' if anchor != "start" else ""
        wt = f' font-weight="{weight}"' if weight else ""
        self.parts.append(
            f'<text x="{x:.1f}" y="{y:.1f}" font-family="{fam}" font-size="{size}"'
            f'{wt} fill="{color}"{a}>{esc(s)}</text>')
        self._t(y + size * 0.4)

    def badge(self, x, y, label, fg, bg, border=None, size=11, h=20):
        w = tw(label, size) + 14
        self.rect(x, y, w, h, fill=bg, stroke=border, rx=R_XS)
        self.text(x + 7, y + h / 2 + size * 0.36, label, size=size, color=fg, weight="600")
        return w

    def button(self, x, y, label, kind="default", size=13, h=32):
        w = tw(label, size) + 28
        if kind == "primary":
            self.rect(x, y, w, h, fill=BRAND, rx=R_SM)
            self.text(x + w / 2, y + h / 2 + size * 0.36, label, size=size, color="#ffffff",
                      weight="600", anchor="middle")
        elif kind == "ghost":
            self.text(x + 14, y + h / 2 + size * 0.36, label, size=size, color=BRAND)
        else:
            self.rect(x, y, w, h, fill=SURFACE, stroke=L3, rx=R_SM)
            self.text(x + w / 2, y + h / 2 + size * 0.36, label, size=size, color=TEXT,
                      anchor="middle")
        return w

    def input(self, x, y, w, placeholder, h=34):
        self.rect(x, y, w, h, fill="#ffffff", stroke=L3, rx=R_SM)
        self.text(x + 12, y + h / 2 + 4.5, placeholder, size=13, color=TEXT4)

    def dot(self, cx, cy, color, r=4):
        self.parts.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r}" fill="{color}"/>')

    def star(self, x, cy, size=11, color=WARN):
        """⭐ 内容的矢量等价物（避免 emoji 字形渲染不确定）。"""
        R, r = size / 2, size / 2 * 0.42
        pts = []
        for i in range(10):
            ang = -math.pi / 2 + i * math.pi / 5
            rad = R if i % 2 == 0 else r
            pts.append(f"{x + rad * math.cos(ang):.1f},{cy + rad * math.sin(ang):.1f}")
        self.parts.append(f'<polygon points="{" ".join(pts)}" fill="{color}"/>')

    def check(self, x, y, label, size=13, color=OK, weight=None):
        """✓ 状态行，返回文本结束 x。"""
        self.text(x, y, "✓", size=size, color=color, weight="600")
        self.text(x + 17, y, label, size=size, color=TEXT, weight=weight)
        return x + 17 + tw(label, size)

    # ── 复合件 ──────────────────────────────────────────────
    def card_begin(self, x, y, w, pad=22, fill=SURFACE, stroke=L2, rx=R_MD):
        idx = len(self.parts)
        self.rect(x, y, w, 10, fill=fill, stroke=stroke, rx=rx)  # 高度占位，末尾回填
        return {"x": x + pad, "w": w - 2 * pad, "y0": y, "y": y + pad, "pad": pad,
                "idx": idx, "X": x, "W": w}

    def card_end(self, cc, extra=0):
        h = cc["y"] + cc["pad"] + extra - cc["y0"]
        self.parts[cc["idx"]] = (
            f'<rect x="{cc["X"]:.1f}" y="{cc["y0"]:.1f}" width="{cc["W"]:.1f}" '
            f'height="{h:.1f}" rx="{R_MD}" fill="{SURFACE}" stroke="{L2}" stroke-width="1"/>')
        self._t(cc["y0"] + h)
        return cc["y0"] + h

    def sec_title(self, x, y, title, hint=None, size=14):
        self.text(x, y + size, title, size=size, color=TEXT, weight="600")
        if hint:
            self.text(x + tw(title, size) + 10, y + size, hint, size=11.5, color=TEXT3)
        return y + size + 12

    def title_action(self, x, y, w, title, action):
        self.text(x, y + 14, title, size=14, color=TEXT, weight="600")
        bw = tw(action, 12) + 22
        self.button(x + w - bw, y - 4, action, kind="default", size=12, h=28)
        return y + 14 + 12

    def kv(self, x, y, label, value, lw=120, mono=False, vsize=13, gap=24):
        self.text(x, y + 13, label, size=13, color=TEXT2)
        self.text(x + lw, y + 13, value, size=vsize, color=TEXT, mono=mono)
        return y + gap

    def svg(self):
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" '
                f'height="{int(self.maxy + 2)}">\n' + "\n".join(self.parts) + "\n</svg>")


# ── 六节内容件（参数化布局，返回结束 y）──────────────────────────────
def sec_auth(c, x, y, w, mode):
    y = c.sec_title(x, y, "认证状态", hint="github.com")
    if mode == "stats":
        colw = w / 4
        cells = [("主机", "github.com", True), ("登录名", "fengcwf", True),
                 ("Token", None, False), ("API 限额", "4995 / 5000", True)]
        for i, (lab, val, mono) in enumerate(cells):
            cx = x + i * colw
            c.text(cx, y + 12, lab, size=12, color=TEXT3)
            if lab == "Token":
                bw = c.badge(cx, y + 22, "已配置", OK_FG, OK_BG)
                c.text(cx + bw + 10, y + 36, "ghp_****", size=12, color=TEXT3, mono=True)
            else:
                c.text(cx, y + 38, val, size=15, color=TEXT, mono=mono)
        y += 52
        c.text(x, y + 12, "限额窗口 1 小时 · 14:32 重置 · 速率正常", size=12, color=TEXT3)
        y += 28
    else:
        y = c.kv(x, y, "主机", "github.com", lw=96, mono=True)
        y = c.kv(x, y, "登录名", "fengcwf", lw=96, mono=True)
        c.text(x, y + 13, "Token", size=13, color=TEXT2)
        bw = c.badge(x + 96, y + 1, "已配置", OK_FG, OK_BG)
        c.text(x + 96 + bw + 10, y + 13, "ghp_****", size=12, color=TEXT3, mono=True)
        y += 24
        y = c.kv(x, y, "API 限额", "4995 / 5000", lw=96, mono=True)
        y = c.kv(x, y, "限额重置", "14:32（今天）", lw=96)
    return y


def sec_token(c, x, y, w):
    y = c.sec_title(x, y, "Token 维护", hint="零明文存储")
    c.text(x, y + 12, "Personal Access Token", size=12, color=TEXT2)
    y += 22
    blabel = "保存并验证"
    bw = tw(blabel, 13) + 28
    if w >= 520:
        c.input(x, y, w - bw - 12, "留空=不修改")
        c.button(x + w - bw, y + 1, blabel, kind="primary")
        y += 34
    else:
        c.input(x, y, w, "留空=不修改")
        y += 34 + 8
        c.button(x, y, blabel, kind="primary")
        y += 32
    y += 12
    eh = 58
    c.rect(x, y, w, eh, fill=ERR_BG, stroke=ERR_LINE, rx=R_SM)
    c.dot(x + 16, y + 18, ERR, r=4)
    c.text(x + 28, y + 23, "401 · token 无效", size=13, color=ERR_FG, weight="600")
    c.text(x + 28, y + 43, "请重新生成 PAT（classic 或 fine-grained）后重试", size=12, color=TEXT2)
    return y + eh


def sec_check(c, x, y, w, mode):
    y = c.sec_title(x, y, "访问检验")
    c.button(x, y + 2, "检查 GitHub 访问", kind="primary")
    y += 32 + 12
    results = [("本地配置", "配置文件解析正常"), ("认证连通", "gh api /user → 200"),
               ("延迟 · 限额", "650ms · 4995/5000")]
    if mode == "blocks" and w >= 620:
        bw = (w - 24) / 3
        for i, (lab, note) in enumerate(results):
            bx = x + i * (bw + 12)
            c.rect(bx, y, bw, 62, fill=PLATFORM, stroke=L1, rx=R_SM)
            c.check(bx + 14, y + 26, lab, size=13)
            c.text(bx + 14, y + 47, note, size=11.5, color=TEXT3, mono=True)
        y += 62 + 14
    else:
        for lab, note in results:
            c.check(x, y + 14, lab, size=13)
            c.text(x + 130, y + 14, note, size=12, color=TEXT3, mono=True)
            y += 24
        y += 8
    c.button(x, y + 2, "重新检查", kind="default")
    return y + 34


def sec_accounts(c, x, y, w):
    y = c.title_action(x, y, w, "多账号库", "添加账号")
    rows = [("fengcwf", "已验证", OK, True), ("ci-bot", "已验证", OK, False),
            ("backup-bot", "待验证", WARN, False)]
    for i, (name, st, dc, active) in enumerate(rows):
        c.dot(x + 6, y + 13, dc, r=4)
        c.text(x + 20, y + 17, name, size=13, color=TEXT, mono=True)
        c.text(x + 160, y + 17, st, size=12, color=TEXT3)
        if active:
            c.badge(x + 240, y + 3, "active", BRAND_FG, BRAND_BG)
            c.text(x + w - 46, y + 17, "当前", size=12, color=TEXT3)
        else:
            c.button(x + w - 58, y + 0, "切换", kind="ghost", size=12, h=26)
        y += 32
        if i < len(rows) - 1:
            c.line(x, y, x + w, y, L1)
            y += 2
    return y


def sec_repo(c, x, y, w):
    y = c.sec_title(x, y, "仓库上下文")
    y = c.kv(x, y, "remote", "origin · github.com/fengcwf/dsh-plugins.git", lw=88, mono=True, vsize=12)
    y = c.kv(x, y, "分支", "main", lw=88, mono=True)
    c.text(x, y + 13, "仓库", size=13, color=TEXT2)
    rx = x + 88
    repo = "fengcwf/dsh-plugins"
    c.text(rx, y + 13, repo, size=13, color=TEXT, mono=True)
    sx = rx + tw(repo, 13, mono=True) + 16
    c.text(sx, y + 13, "·", size=13, color=TEXT3)
    c.star(sx + 18, y + 9, size=11)
    c.text(sx + 30, y + 13, "12", size=13, color=TEXT2)
    return y + 24


def sec_health(c, x, y, w, mode):
    y = c.sec_title(x, y, "插件自检")
    items = [("配置合成", "cordis.patch.yml 合并正常"), ("gh 可用", "gh 2.62.0 在位"),
             ("凭据在位", "token 已加载")]
    if mode == "inline" and w >= 560:
        cw = w / 3
        for i, (lab, note) in enumerate(items):
            ix = x + i * cw
            c.check(ix, y + 14, lab, size=13)
            c.text(ix, y + 33, note, size=11, color=TEXT3)
        y += 44
    else:
        for lab, note in items:
            c.check(x, y + 14, lab, size=13)
            c.text(x + 120, y + 14, note, size=11.5, color=TEXT3)
            y += 23
        y += 4
    return y


# ── 候选 1：分区卡片式 ─────────────────────────────────────────────
def build_candidate1():
    c = C(1120)
    c.rect(0, 0, 1120, 10, fill=PLATFORM)  # 画布占位，结尾回填
    canvas_idx = 0
    x0, W = 40, 1040
    c.text(x0, 56, "GitHub 集成", size=20, color=TEXT, weight="500")
    c.text(x0, 82, "dsh-github-ops · 认证、访问检验与仓库上下文", size=13, color=TEXT2)
    y = 112
    for fn, mode in [(sec_auth, "stats"), (sec_token, None), (sec_check, "blocks"),
                     (sec_accounts, None), (sec_repo, None), (sec_health, "inline")]:
        cc = c.card_begin(x0, y, W, pad=22)
        if fn is sec_auth:
            cc["y"] = fn(c, cc["x"], cc["y"], cc["w"], "stats")
        elif fn is sec_check:
            cc["y"] = fn(c, cc["x"], cc["y"], cc["w"], "blocks")
        elif fn is sec_health:
            cc["y"] = fn(c, cc["x"], cc["y"], cc["w"], "inline")
        else:
            cc["y"] = fn(c, cc["x"], cc["y"], cc["w"])
        y = c.card_end(cc) + 18
    total = c.maxy + 24
    c.parts[canvas_idx] = f'<rect x="0" y="0" width="1120" height="{int(total)}" fill="{PLATFORM}"/>'
    return c, total


# ── 候选 2：紧凑表单式 ─────────────────────────────────────────────
def build_candidate2():
    c = C(1120)
    c.rect(0, 0, 1120, 10, fill=BG_BASE)
    canvas_idx = 0
    x0, W = 140, 840
    c.text(x0, 52, "GitHub 集成", size=18, color=TEXT, weight="600")
    c.text(x0 + tw("GitHub 集成", 18) + 12, 52, "dsh-github-ops", size=12, color=TEXT3, mono=True)
    c.text(x0, 74, "认证、访问检验与多账号管理", size=12.5, color=TEXT2)
    y = 96
    sections = [
        (sec_auth, "rows"), (sec_token, None), (sec_check, "rows"),
        (sec_accounts, None), (sec_repo, None), (sec_health, "rows"),
    ]
    for i, (fn, mode) in enumerate(sections):
        if fn is sec_auth:
            y = fn(c, x0, y, W, "rows")
        elif fn is sec_check:
            y = fn(c, x0, y, W, "rows")
        elif fn is sec_health:
            y = fn(c, x0, y, W, "rows")
        else:
            y = fn(c, x0, y, W)
        y += 10
        if i < len(sections) - 1:
            c.line(x0, y, x0 + W, y, L2)
            y += 22
    total = c.maxy + 40
    c.parts[canvas_idx] = f'<rect x="0" y="0" width="1120" height="{int(total)}" fill="{BG_BASE}"/>'
    return c, total


# ── 候选 3：双栏概览式 ─────────────────────────────────────────────
def build_candidate3():
    c = C(1120)
    c.rect(0, 0, 1120, 10, fill=PLATFORM)
    canvas_idx = 0
    x0 = 40
    LW, RW = 440, 576
    lx, rx = x0, x0 + LW + 24
    c.text(x0, 56, "GitHub 集成", size=20, color=TEXT, weight="500")
    c.text(x0, 82, "dsh-github-ops · 认证、访问检验与仓库上下文", size=13, color=TEXT2)
    ly = ry = 112
    # 左栏：状态概览（认证 + 检验 + 自检）
    cc = c.card_begin(lx, ly, LW, pad=20)
    cc["y"] = sec_auth(c, cc["x"], cc["y"], cc["w"], "rows")
    ly = c.card_end(cc) + 16
    cc = c.card_begin(lx, ly, LW, pad=20)
    cc["y"] = sec_check(c, cc["x"], cc["y"], cc["w"], "rows")
    ly = c.card_end(cc) + 16
    cc = c.card_begin(lx, ly, LW, pad=20)
    cc["y"] = sec_health(c, cc["x"], cc["y"], cc["w"], "rows")
    ly = c.card_end(cc)
    # 右栏：管理操作（token 表单 + 多账号 + 仓库）
    cc = c.card_begin(rx, ry, RW, pad=20)
    cc["y"] = sec_token(c, cc["x"], cc["y"], cc["w"])
    ry = c.card_end(cc) + 16
    cc = c.card_begin(rx, ry, RW, pad=20)
    cc["y"] = sec_accounts(c, cc["x"], cc["y"], cc["w"])
    ry = c.card_end(cc) + 16
    cc = c.card_begin(rx, ry, RW, pad=20)
    cc["y"] = sec_repo(c, cc["x"], cc["y"], cc["w"])
    ry = c.card_end(cc)
    total = max(ly, ry) + 24
    c.parts[canvas_idx] = f'<rect x="0" y="0" width="1120" height="{int(total)}" fill="{PLATFORM}"/>'
    return c, total


def main():
    for name, fn in [("candidate-1", build_candidate1), ("candidate-2", build_candidate2),
                     ("candidate-3", build_candidate3)]:
        c, _ = fn()
        svg_path = os.path.join(OUT, f"{name}.svg")
        png_path = os.path.join(OUT, f"{name}.png")
        with open(svg_path, "w", encoding="utf-8") as f:
            f.write(c.svg())
        subprocess.run(["rsvg-convert", "--zoom", "2", "-o", png_path, svg_path], check=True)
        print(name, "->", png_path)


if __name__ == "__main__":
    main()
