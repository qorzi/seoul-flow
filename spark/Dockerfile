# --- 1단계: 빌드 스테이지 ---
# sbt와 Java가 포함된 이미지를 사용하여 애플리케이션 JAR 파일을 빌드합니다.
FROM sbtscala/scala-sbt:eclipse-temurin-17.0.15_6_1.11.2_3.7.1 AS builder

WORKDIR /app
# sbt가 의존성을 효율적으로 캐싱하도록 설정 파일을 먼저 복사합니다.
COPY project ./project
COPY build.sbt ./
# RUN sbt update # 필요 시 의존성 미리 다운로드

# 전체 소스 코드를 복사합니다.
COPY src ./src

# sbt-assembly를 사용하여 모든 의존성이 포함된 하나의 JAR(Fat JAR) 파일로 빌드합니다.
RUN sbt assembly

# --- 2단계: 실행 스테이지 ---
# 실제 스파크가 설치된 이미지를 베이스로 사용합니다.
FROM bitnami/spark:3.5.6
# 빌드 스테이지에서 생성된 JAR 파일을 실행 스테이지로 복사합니다.
COPY --from=builder /app/target/scala-2.12/spark-grazing-detector-assembly-*.jar /app/app.jar