import { useAuth } from '@/providers/auth';
import { BsPersonCircle } from 'react-icons/bs';
import GoogleButton from './GoogleButton';

interface LayoutProps {
  children?: React.ReactNode;
  onNavigate?: (path: string) => void;
  apiKeyPreview?: string;
}

export default function Layout({
  children,
  onNavigate = () => { },
  apiKeyPreview = '',
}: LayoutProps) {
  const auth = useAuth();

  return (
    <div className="mx-auto flex flex-col space-y-4">
      <header className="sticky top-0 z-40 bg-white w-screen">
        <div className="h-16 border-b border-b-slate-200 w-full flex flex-col items-center">
          <nav className="flex items-center justify-between w-[75vw] mx-auto h-full">
            <h1>
              <a
                href="#"
                onClick={() => onNavigate('home')}
                className="hover:text-slate-600 cursor-pointer font-bold text-2xl leading-[1.1] tracking-tighter"
              >
                Chat and Summarize Your Docs
              </a>
            </h1>
            <div className="flex flex-grow"></div>
              {(auth.isSignedIn && apiKeyPreview) && (
              <div className="flex flex-row gap-2 items-center pr-4">
                API Key: {apiKeyPreview}
              </div>
              )}
            <div className="flex flex-col gap-2 ">
              {auth.isSignedIn ? (
                <button
                  className="flex flex-row border rounded-lg p-2 gap-3 items-center hover:bg-slate-500/10"
                  onClick={() => onNavigate('profile')}
                >
                  <BsPersonCircle />
                  {auth.user?.attributes.email}
                </button>
              ) : (
                <>
                  <GoogleButton onClick={auth.signInWithGoogle}>
                    Sign in with Google
                  </GoogleButton>
                </>
              )}
            </div>
          </nav>
        </div>
      </header>
      <div>
        <main className="flex w-full flex-1 flex-col overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
