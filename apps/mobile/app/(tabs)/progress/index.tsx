import { useRouter } from 'expo-router';

import { ProgressIndexScreen } from '../../../src/progress/ProgressIndexScreen';

export default function ProgressIndexRoute() {
  const router = useRouter();
  return <ProgressIndexScreen onNavigate={(path) => router.push(path)} />;
}
