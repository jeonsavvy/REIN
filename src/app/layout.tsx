import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "REIN — Autonomous commerce, held to proof",
  description:
    "Gemini 3.5 Flash가 예산 안에서 데이터를 선택하고 Solana Devnet x402로 구매하는 Agentic Commerce 데모입니다.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
