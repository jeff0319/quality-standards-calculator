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

打开 `http://127.0.0.1:8018`。

Docker 会安装 `requirements.txt` 中的 Flask、numpy、scipy 和 gunicorn。
`docker-compose.yml` 会把 `app.py`、`backend/` 和 `frontend/` 挂载到容器内：
前端静态文件或模板的小改动通常刷新页面即可；Python 代码改动会触发 gunicorn `--reload` 自动重启。
只有改了 `requirements.txt`、`Dockerfile` 或系统依赖时，才需要重新 build。

双侧正态容差区间默认使用快速工程近似，适合 VPS 部署。页面中可切换为精确数值积分，并提供停止按钮；精确解会显著增加 CPU 开销，不建议在低配 Web 服务中作为默认模式。

## 本地开发

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python app.py
```

打开 `http://127.0.0.1:8018`。

## 功能

- 双侧、仅下限、仅上限三种验证模式
- 计算样本量、均值、样本标准差、ISO k 因子、LTL / UTL
- 输出建议产品宣称值或宣称范围
- 输入 LSL / USL 后自动判断是否合格
- 前端 SVG 绘制正态分布、容差边界、规格边界和样本点
