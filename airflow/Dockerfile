FROM apache/airflow:2.9.2-python3.11

USER root

RUN apt-get update && apt-get install -y openjdk-17-jdk && apt-get clean
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-arm64
ENV PATH=$JAVA_HOME/bin:$PATH

RUN curl -L https://archive.apache.org/dist/spark/spark-3.5.1/spark-3.5.1-bin-hadoop3.tgz | tar xz -C /opt/ && \
    ln -s /opt/spark-3.5.1-bin-hadoop3 /opt/spark
ENV SPARK_HOME=/opt/spark
ENV PATH=$SPARK_HOME/bin:$PATH

# Airflow를 실행하는 유저를 root에서 airflow로 변경합니다.
USER airflow

RUN pip install pyspark==3.5.1

# 필요한 Airflow Provider를 설치합니다.
# apache-airflow-providers-apache-spark: Spark와 연동하기 위한 Provider
# apache-airflow-providers-postgres: Postgres와 연동하기 위한 Provider
# apache-airflow-providers-redis: Redis와 연동하기 위한 Provider
RUN pip install --no-cache-dir "apache-airflow-providers-apache-spark==4.2.0" \
    "apache-airflow-providers-postgres==5.10.0" \
    "apache-airflow-providers-redis==3.5.0"