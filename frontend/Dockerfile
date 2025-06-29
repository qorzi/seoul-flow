# --- 1단계: 빌드(Build) 스테이지 ---
# Node.js 이미지를 'builder'라는 별명으로 사용
FROM node:20-alpine AS builder

# 작업 디렉토리 설정
WORKDIR /app

# 의존성 설치
COPY package*.json ./
RUN npm install

# 소스 코드 전체 복사
COPY . .

# 리액트 앱 빌드 (build 폴더에 최적화된 정적 파일 생성)
RUN npm run build

# --- 2단계: 서빙(Serve) 스테이지 ---
# 가벼운 웹 서버인 Nginx 이미지를 사용
FROM nginx:1.27-alpine

# 'builder' 스테이지에서 생성된 빌드 결과물(/app/build)을
# Nginx의 기본 웹 루트 디렉토리로 복사
COPY --from=builder /app/build /usr/share/nginx/html

# SPA(Single Page Application) 라우팅을 위해 Nginx 설정을 복사 (선택사항이지만 강력 추천)
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# Nginx가 80번 포트를 사용함을 명시
EXPOSE 80

# 컨테이너 실행 시 Nginx 실행 (기본 명령어)
CMD ["nginx", "-g", "daemon off;"]