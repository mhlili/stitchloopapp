import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { getToken } from '../lib/api';

// Sends logged-in users to the tabs and everyone else to the login screen
export default function Index() {
  const [token, setTokenState] = useState(undefined);

  useEffect(() => {
    getToken().then((t) => setTokenState(t ?? null));
  }, []);

  if (token === undefined) return null; // still checking
  return <Redirect href={token ? '/(tabs)/home' : '/login'} />;
}
