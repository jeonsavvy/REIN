import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "REIN — 데이터를 골라 결제하는 AI 에이전트",
  description:
    "목표와 예산만 정하면 REIN이 필요한 데이터를 골라 예산 안에서 결제하고 영수증을 남깁니다.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
