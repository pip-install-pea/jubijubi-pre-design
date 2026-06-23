import "./globals.css";
import ClientLayoutWrapper from "../components/ClientLayoutWrapper";

export const metadata = {
  title: "Jubilant CSR Platform",
  description: "CSR Monitoring and Analytics Dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>
        <ClientLayoutWrapper>{children}</ClientLayoutWrapper>
      </body>
    </html>
  );
}
