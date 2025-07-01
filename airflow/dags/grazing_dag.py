from __future__ import annotations
import os
import pendulum

from airflow.models.dag import DAG
from airflow.providers.docker.operators.docker import DockerOperator
from docker.types import Mount

# 환경 변수에서 호스트의 프로젝트 절대 경로를 가져옵니다.
HOST_PROJECT_PATH = os.getenv("HOST_PROJECT_PATH")

if HOST_PROJECT_PATH is None:
    raise ValueError("Airflow 컨테이너에 HOST_PROJECT_PATH 환경 변수가 설정되지 않았습니다.")

# DAG 기본 설정
with DAG(
    dag_id="grazing_detection_streaming_cluster",
    start_date=pendulum.datetime(2025, 1, 1, tz="Asia/Seoul"),
    catchup=False,
    schedule_interval="@once", # 한번만 실행
    tags=["spark", "streaming", "seoul-flow", "docker"],
) as dag:
    # DockerOperator를 사용하여 spark-submit 명령을 실행합니다.
    submit_spark_job_via_docker = DockerOperator(
        task_id="submit_grazing_detector_job",
        # Spark Worker와 동일한 이미지를 사용
        image="bitnami/spark:3.5",
        # 이 컨테이너가 실행할 명령어
        command=[
            "/opt/bitnami/spark/bin/spark-submit",
            "--master", "spark://spark-master:7077",
            "--packages", "org.apache.spark:spark-sql-kafka-0-10_2.13:3.5.1",
            "--name", "arrow-spark-docker",
            # Bitnami 이미지 내부 경로에 맞게 파일 경로 지정
            "/opt/bitnami/spark/spark_jobs/grazing_detector.py",
            "kafka:29092"
        ],
        # Airflow 컨테이너가 호스트의 Docker 데몬을 사용하도록 설정
        docker_url="unix://var/run/docker.sock",
        # 다른 컨테이너와 통신하기 위해 동일한 네트워크에 연결
        network_mode="seoul-flow-net",
        # 임시 파일을 마운트하지 않도록 설정
        mount_tmp_dir=False,
        # 필요한 볼륨을 마운트
        mounts=[
            # Spark 잡 코드가 담긴 볼륨
            Mount(
                source=f"{HOST_PROJECT_PATH}/airflow/spark_jobs",
                target="/opt/bitnami/spark/spark_jobs",
                type="bind"
            ),
            # 체크포인트용 공유 볼륨
            Mount(source="spark-checkpoints", target="/opt/bitnami/spark/checkpoints", type="volume")
        ],
        # 컨테이너 실행 후 자동으로 삭제
        auto_remove=True,
    )