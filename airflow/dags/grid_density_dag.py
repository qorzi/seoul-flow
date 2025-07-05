from __future__ import annotations

import pendulum
from datetime import timedelta

from airflow.models.dag import DAG
from airflow.providers.apache.spark.operators.spark_submit import SparkSubmitOperator

# DAG 기본 설정
with DAG(
    dag_id="grid_density_hourly_cluster",
    start_date=pendulum.datetime(2025, 7, 1, tz="Asia/Seoul"),
    catchup=False,
    # 매시간 15분에 실행되도록 CRON 표현식 사용
    schedule="15 * * * *",
    tags=["spark", "batch", "density", "seoul-flow"],
    doc_md="""
    ### Grid Density Hourly DAG
    
    이 DAG는 1시간마다 Spark를 통해 사용자 위치 데이터의 그리드 밀도를 계산합니다.
    - **스케줄**: 매시간 15분
    - **작업**: `grid_density_detector.py` Spark 잡 제출
    """,
) as dag:
    # SparkSubmitOperator를 사용하여 작업을 정의합니다.
    submit_spark_job = SparkSubmitOperator(
        task_id="submit_grid_density_job",
        # Airflow UI에서 설정한 Spark Connection ID
        conn_id="spark_default",
        # 제출할 PySpark 파일의 경로 (Airflow 컨테이너 내부 경로)
        application="/opt/airflow/spark_jobs/grid_density_detector.py",
        # PySpark 스크립트에 전달할 인자 (Kafka 브로커 주소 등)
        application_args=["kafka:29092"],
        # 필요한 Spark 패키지
        packages="org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.1",
        conf={"spark.cores.max": "2"},
        retries=2, # 실패 시 2번 더 재시도
        retry_delay=timedelta(minutes=3), # 재시도 간격 3분
    )