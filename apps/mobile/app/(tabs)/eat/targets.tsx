import { useRouter } from 'expo-router';

import { TargetsScreen } from '../../../src/eat/TargetsScreen';

export default function TargetsRoute() {
  const router = useRouter();
  return <TargetsScreen onNavigate={(path) => router.push(path)} />;
}
