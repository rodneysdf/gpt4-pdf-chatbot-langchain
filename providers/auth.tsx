import { CognitoHostedUIIdentityProvider } from '@aws-amplify/auth';
import { Auth, Hub } from 'aws-amplify';
import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';

type AuthState = {
  user: any;
  sub: string;
  // accessToken: string;
  getAccessToken(): Promise<string>;
  isSignedIn: boolean;
  signInWithGoogle(): void;
  signOut(): void;
};


export const AuthStateContext = createContext<AuthState>({} as any);

export const AuthStateProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<any>(null);
  const [isSignedIn, setIsSignedIn] = useState<boolean>(false);

  useEffect(() => {
    Hub.listen('auth', ({ payload: { event, data } }) => {
      switch (event) {
        case 'signIn':
        case 'cognitoHostedUI':
          getUser().then((userData) => setUser(userData));
          setIsSignedIn(true);
          break;
        case 'signOut':
          setUser(null);
          setIsSignedIn(false);
          break;
        case 'signIn_failure':
        case 'cognitoHostedUI_failure':
          console.log('Sign in failure', data);
          break;
      }
    });

    getUser().then((userData) => setUser(userData));
  }, []);

  console.log(user);

  async function getUser() {
    const user = await Auth.currentAuthenticatedUser();

    if (user) {
      setIsSignedIn(true);
      return user;
    }
  }

  async function signOut() {
    await Auth.signOut();
    window.localStorage.clear();
  }

  async function getAccessToken() {
    const user = await getUser();

    if (user) {
      const accessToken = user?.signInUserSession?.accessToken?.jwtToken || '';

      if (!accessToken) {
        return '';
      }

      return accessToken;
    } else {
      return '';
    }
  }

  const signInWithGoogle = () => {
    Auth.federatedSignIn({
      provider: CognitoHostedUIIdentityProvider.Google,
    });
  };

  const sub = user?.attributes?.sub || '';
  const accessToken = user?.signInUserSession?.accessToken?.jwtToken || '';

  return (
    <AuthStateContext.Provider
      value={{
        sub,
        getAccessToken,
        user,
        isSignedIn,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AuthStateContext.Provider>
  );
};

export const useAuth = () => useContext(AuthStateContext);
