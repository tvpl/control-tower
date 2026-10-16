import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Modernization Control Tower",
  description: "Arquitetura, delivery e governança em um único contexto.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
