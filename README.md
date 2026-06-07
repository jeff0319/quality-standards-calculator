# ISO 16269-6 宣称值与规格验证网页

根据样本数据计算 ISO 16269-6 统计容差边界，并验证 LSL / USL 是否合格。

## 项目结构

```text
app.py                Web 服务入口
backend/
  iso_validation.py   核心统计计算
frontend/
  templates/          HTML
  static/             CSS 与 JS
docs/                 推导说明
```

## Docker 部署

```bash
docker compose up --build -d
```

打开 `http://127.0.0.1:8000`。

Docker 会安装 `requirements.txt` 中的 Flask、numpy、scipy 和 gunicorn。

## 本地开发

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python app.py
```

打开 `http://127.0.0.1:8000`。

## 功能

- 双侧、仅下限、仅上限三种验证模式
- 计算样本量、均值、样本标准差、ISO k 因子、LTL / UTL
- 输出建议产品宣称值或宣称范围
- 输入 LSL / USL 后自动判断是否合格
- 前端 SVG 绘制正态分布、容差边界、规格边界和样本点
