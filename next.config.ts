import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 모바일 하단 탐색을 가리지 않도록 개발 표시를 숨긴다.
  devIndicators: false,
  // 시험용 빌드를 운영 중인 빌드(.next)와 다른 폴더에 만들 때만 쓴다(예: NEXT_DIST_DIR=.next-test).
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // 배포용 Docker 이미지에 필요한 파일만 담는다(.next/standalone).
  output: "standalone",
  experimental: {
    // 사진·도면 업로드를 Server Action으로 받는다.
    serverActions: { bodySizeLimit: "30mb" },
  },
};

export default nextConfig;
