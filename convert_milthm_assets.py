#!/usr/bin/env python3
"""
从 milthm-calculator-web/images.css 提取曲绘，写入 assets/images.css。

曲绘以 base64 data URL 嵌在 CSS 中；运行时由 renderer 解析。
图标/背景/字体仍由 assets/icons、assets/backgrounds、assets/fonts 提供（本脚本不处理）。
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore
if sys.stderr.encoding != "utf-8":
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")  # type: ignore

PROJECT_ROOT = Path(__file__).parent
SRC_CSS = PROJECT_ROOT / "third_party" / "milthm-calculator-web" / "images.css"
DST_CSS = PROJECT_ROOT / "assets" / "images.css"


def main() -> None:
    print("=" * 60)
    print("Milthm 曲绘同步（images.css）")
    print("=" * 60)

    if not SRC_CSS.exists():
        print(f"[E] 找不到 {SRC_CSS}")
        print("请先: git submodule update --init --remote third_party/milthm-calculator-web")
        raise SystemExit(1)

    DST_CSS.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(SRC_CSS, DST_CSS)
    size_mb = DST_CSS.stat().st_size / (1024 * 1024)
    print(f"[OK] {SRC_CSS.name} -> {DST_CSS} ({size_mb:.1f} MB)")
    print("完成。构建时 rolldown 也会再拷一份到 lib/assets/。")


if __name__ == "__main__":
    main()
