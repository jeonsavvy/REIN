import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "REIN — 목표와 예산만 받는 자율 데이터 조달 에이전트",
  description:
    "Gemini가 필요한 데이터를 고르면 정책 엔진이 검사하고 REIN 전용 지갑이 Solana Devnet에서 자동 결제합니다.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
