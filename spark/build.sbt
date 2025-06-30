ThisBuild / version := "0.1.0-SNAPSHOT"
// ThisBuild / scalaVersion := "2.13.12" // 이 라인을 수정합니다.
ThisBuild / scalaVersion := "2.12.18" // Spark 3.x와 호환되는 Scala 2.12 버전으로 변경

lazy val root = (project in file("."))
  .settings(
    name := "spark-grazing-detector",
    // idePackagePrefix := Some("com.seoulflow.spark")
  )

// 스파크 버전을 최신 안정화 버전으로 명시합니다.
val sparkVersion = "3.5.6" // 이 버전은 Spark 2.12로 빌드되었습니다.

// 라이브러리 의존성 설정
libraryDependencies ++= Seq(
  "org.apache.spark" %% "spark-core" % sparkVersion % "provided",
  "org.apache.spark" %% "spark-sql" % sparkVersion % "provided",
  "org.apache.spark" %% "spark-sql-kafka-0-10" % sparkVersion % "provided"
)

assembly / assemblyMergeStrategy := {
  case PathList("META-INF", xs @ _*) => MergeStrategy.discard
  case x => MergeStrategy.first
}

assembly / assemblyExcludedJars := {
  val cp = (fullClasspath in assembly).value
  cp filter { jar =>
    val name = jar.data.getName
    name.startsWith("spark-core") ||
    name.startsWith("spark-sql") ||
    name.startsWith("spark-sql-kafka-0-10")
  }
}