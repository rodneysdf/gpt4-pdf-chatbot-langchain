import '@/styles/base.css';
import type { AppProps } from 'next/app';
import { Inter } from 'next/font/google';
import { Amplify } from "aws-amplify";
import awsmobile from "../config/aws-exports";
import "@aws-amplify/ui-react/styles.css";

Amplify.configure({ ...awsmobile, ssr: true });

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <main className={inter.variable}>
        <Component {...pageProps} />
      </main>
    </>
  );
}

export default MyApp;
