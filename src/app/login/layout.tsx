import { ThemeProvider } from "next-themes";

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      storageKey="ndns-theme"
    >
      {children}
    </ThemeProvider>
  );
}
