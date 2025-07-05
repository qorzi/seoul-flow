from __future__ import annotations

import pendulum
from datetime import timedelta

from airflow.models.dag import DAG
from docker.types import Mount

from airflow.providers.apache.spark.operators.spark_submit import SparkSubmitOperator

# DAG 기본 설정
with DAG(
    dag_id="grazing_detection_streaming_cluster",
    start_date=pendulum.datetime(2025, 1, 1, tz="Asia/Seoul"),
    catchup=False,
    schedule=None, # 수동 실행을 위해 None으로 설정
    tags=["spark", "streaming", "seoul-flow"],
    doc_md="""
    ### Grazing Detection Streaming DAG
    
    이 DAG는 실시간으로 사용자 간의 '스침(Grazing)' 이벤트를 감지하는 Spark Streaming 작업을 시작합니다.
    - **스케줄**: 수동 실행 (`schedule=None`)
    - **작업**: `grazing_detector.py` Spark 스트리밍 잡 제출
    - **특징**: 한 번 실행되면 `awaitTermination()`에 의해 계속 실행되는 스트리밍 애플리케이션을 구동합니다.
    """,
) as dag:
    # SparkSubmitOperator를 사용하여 작업을 정의합니다.
    submit_spark_job = SparkSubmitOperator(
        task_id="submit_grazing_detector_job",
        # Airflow UI에서 설정한 Spark Connection ID
        conn_id="spark_default",
        # 제출할 PySpark 파일의 경로 (Spark 클러스터 컨테이너 내부 경로)
        application="/opt/airflow/spark_jobs/grazing_detector.py",
        # PySpark 스크립트에 전달할 인자
        application_args=["kafka:29092"],
        # 필요한 패키지
        packages="org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.1",
        conf={"spark.cores.max": "2"},
        retries=1,
        retry_delay=timedelta(minutes=1),
    )