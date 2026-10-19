import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ML Controller Portal',
  description: 'Close, consolidation and reporting for the Mama Lycha Group',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
