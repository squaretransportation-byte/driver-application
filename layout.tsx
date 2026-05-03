import "./globals.css";

export const metadata = {
  title: "Square Transportation — Driver Onboarding",
  description: "FMCSA-compliant driver application for Square Transportation Solution Inc · MC-728978",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
