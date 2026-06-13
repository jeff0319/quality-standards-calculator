# 质量标准计算工具

面向质量、声学和统计验证场景的 Web 计算工具。目前包含两个标准页面：

- ISO 16269-6：根据样本数据计算统计容差边界，并验证 LSL / USL 是否合格。
- IEC 60704-3：根据噪声测试结果计算宣称值、抽检接受限和 OC 曲线。

## 项目结构

```text
app.py                Web 服务入口
backend/
  iso_16269.py        ISO 16269-6 统计容差区间计算
  iec60704.py         IEC 60704-3 宣称值与 OC 计算
  parsing.py          样本输入解析
frontend/
  templates/
    home.html         标准选择首页
    iso16269.html     ISO 16269-6 页面
    iec60704.html     IEC 60704-3 页面
  static/
    iso16269.js       ISO 16269-6 前端交互
    iec60704.js       IEC 60704-3 前端交互
    styles.css        共用样式
docs/                 推导说明
```

## Docker 部署

```bash
docker compose up --build -d
```

打开 `http://127.0.0.1:8018`，选择需要使用的标准工具。

Docker 会安装 `requirements.txt` 中的 Flask、numpy、scipy 和 gunicorn。
`docker-compose.yml` 会把 `app.py`、`backend/` 和 `frontend/` 挂载到容器内：
前端静态文件或模板的小改动通常刷新页面即可；Python 代码改动会触发 gunicorn `--reload` 自动重启。
只有改了 `requirements.txt`、`Dockerfile` 或系统依赖时，才需要重新 build。

ISO 16269-6 双侧正态容差区间默认使用快速工程近似，适合 VPS 部署。页面中可切换为精确数值积分，并提供停止按钮；精确解会显著增加 CPU 开销，不建议在低配 Web 服务中作为默认模式。

## 本地开发

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python app.py
```

打开 `http://127.0.0.1:8018`。

## 功能

### ISO 16269-6

- 双侧、仅下限、仅上限三种验证模式
- 计算样本量、均值、样本标准差、ISO k 因子、LTL / UTL
- 输出可宣称下限、可宣称上限或可宣称范围
- 输入 LSL / USL 后自动判断是否合格
- 前端 SVG 绘制正态分布、容差边界、规格边界和样本点

### IEC 60704-3

- 计算推荐噪声宣称值 Lc
- 支持抽检样本均值与接受限判断
- 输出不同质量水平与接收概率组合下的宣称值表
- 前端 SVG 绘制质量水平与接收概率 OC 曲线
