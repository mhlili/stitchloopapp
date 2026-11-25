import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { api, setToken } from '../lib/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function logIn() {
    setBusy(true);
    try {
      const { token } = await api('/auth/login', { method: 'POST', body: { email, password } });
      await setToken(token);
      router.replace('/(tabs)/home');
    } catch (err) {
      Alert.alert('Could not log in', err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Log in</Text>
      <TextInput style={styles.input} placeholder="Email" autoCapitalize="none"
        keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Password" secureTextEntry
        value={password} onChangeText={setPassword} />
      <Pressable style={styles.button} onPress={logIn} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? 'Logging in…' : 'Log in'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 24, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#222', borderRadius: 4, padding: 12, marginBottom: 12 },
  button: { backgroundColor: '#3b2335', padding: 14, borderRadius: 4, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
