import '@/styles/base.css';
import type { AppProps } from 'next/app';
import { Inter } from 'next/font/google';
import { Amplify } from "aws-amplify";
import awsmobile from "../config/aws-exports";
import "@aws-amplify/ui-react/styles.css";
import { SessionProvider } from "next-auth/react"

Amplify.configure({ ...awsmobile, ssr: true });

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

export default function MyApp({
  Component,
  pageProps: { session, ...pageProps },
} : AppProps) {
  return (
    <SessionProvider session={session}>
      <Component {...pageProps} />
    </SessionProvider>
  )
}