FROM apache/airflow:2.9.2

# Docker Provider 설치
RUN pip install --no-cache-dir "apache-airflow-providers-docker==3.9.1" \
    "apache-airflow-providers-postgres==5.10.0" \
    "apache-airflow-providers-redis==3.5.0"

# ✨ 아래 3줄 추가 (airflow 유저를 docker 그룹에 추가)
USER root
RUN groupadd --gid 999 docker || true
RUN usermod -aG docker airflow
USER airflow