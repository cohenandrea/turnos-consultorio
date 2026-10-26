import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";

const body = Nunito({ subsets: ["latin"], variable: "--font-body", display: "swap", weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: { default: "Turnos online", template: "%s · Turnos online" },
  description: "Reservá, consultá o reprogramá tu turno en minutos.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#fbf7f5" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={body.variable}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
