import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "REIN — 예산 안에서 데이터를 사는 AI 에이전트",
  description:
    "Gemini 3.5 Flash가 필요한 데이터를 고르고 Solana Devnet에서 결제한 뒤 영수증과 비교 보고서를 남깁니다.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
