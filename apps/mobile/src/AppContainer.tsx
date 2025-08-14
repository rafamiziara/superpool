import { AppKitButton } from '@reown/appkit-wagmi-react-native';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export default function AppContainer() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>SuperPool</Text>
      <AppKitButton />
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    marginBottom: 32,
    fontWeight: 800
  }
});
