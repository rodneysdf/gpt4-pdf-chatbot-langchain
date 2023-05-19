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

  // console.log(user);

  async function getUser() {
    const user = await Auth.currentAuthenticatedUser();
    if (user) {
      setIsSignedIn(true);
      return user;
    }
  }

  async function signOut() {
    // signout will not delete your local keys
    // try {
    //   window.localStorage.clear();
    // } catch (error: any) {
    //   console.log("auth signout error", error)
    // }
    await Auth.signOut();   // Note: this page navigates to another page, so don't put anything in this function after this
  }

  async function getAccessToken() {
    const session = await Auth.currentSession();
    if (!session) {
      return '';
    }
    return session.getAccessToken().getJwtToken();
  }

  const signInWithGoogle = () => {
    Auth.federatedSignIn({
      provider: CognitoHostedUIIdentityProvider.Google,
    });
  };

  const sub = user?.attributes?.sub || '';

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
