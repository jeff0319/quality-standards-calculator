FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8018

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py ./
COPY backend ./backend
COPY frontend ./frontend

EXPOSE 8018

CMD ["gunicorn", "--bind", "0.0.0.0:8018", "app:app"]
