import { Redirect } from 'expo-router';

export default function IndexScreen() {
  // Default to onboarding screen - navigation logic handled there
  return <Redirect href="/onboarding" />;
}

