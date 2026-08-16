import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { BottomNav } from "@/components/bottom-nav";
import { Sidebar } from "@/components/sidebar";
import { iniciales } from "@/lib/cursada";
import { getPerfil } from "@/lib/queries";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const perfil = await getPerfil();

  return (
    <html lang="es-AR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: temaInicial }} />
      </head>
      <body className={`${jakarta.variable} ${jetbrains.variable} antialiased`}>
        <Sidebar nombre={perfil?.nombre ?? ''} iniciales={iniciales(perfil?.nombre ?? '')} />
        {/* Móvil: 720px centrado con despeje para la bottom nav.
            Desktop (>640px): 1150px con el hueco de la sidebar de 232px. */}
        <div className="mx-auto max-w-[720px] px-[18px] pt-[26px] pb-[130px] min-[641px]:max-w-[1150px] min-[641px]:pt-[34px] min-[641px]:pr-10 min-[641px]:pb-20 min-[641px]:pl-[274px]">
          {children}
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
