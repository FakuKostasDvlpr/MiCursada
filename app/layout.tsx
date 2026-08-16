import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mi Cursada",
  description: "Organizá tu cursada nocturna: materias, notas, avisos.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
    { media: "(prefers-color-scheme: light)", color: "#f1f5f9" },
  ],
};

// Aplica el tema antes del primer paint para evitar FOUC.
const temaInicial = `
try {
  var t = localStorage.getItem('tema');
  if (t === 'claro' || (t === null && window.matchMedia('(prefers-color-scheme: light)').matches)) {
    document.documentElement.dataset.tema = 'claro';
  }
} catch (e) {}
`;

/**
 * Shell mínimo: fuentes, tema y nada más. La nav y el contenedor viven en
 * app/(app)/layout.tsx, que además exige sesión — /login queda afuera de ese
 * grupo y por eso se ve sin nav y sin pedir nada.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-AR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: temaInicial }} />
      </head>
      <body className={`${jakarta.variable} ${jetbrains.variable} antialiased`}>{children}</body>
    </html>
  );
}
