from __future__ import annotations

import re
from typing import Iterable


def parse_samples(raw: str | Iterable[float]) -> list[float]:
    if isinstance(raw, str):
        values = [item for item in re.split(r"[\s,，;；]+", raw.strip()) if item]
        if not values:
            raise ValueError("请输入样本数据。")
        try:
            return [float(item) for item in values]
        except ValueError as exc:
            raise ValueError("样本数据中存在无法识别的数字。") from exc

    try:
        return [float(item) for item in raw]
    except (TypeError, ValueError) as exc:
        raise ValueError("样本数据格式不正确。") from exc
