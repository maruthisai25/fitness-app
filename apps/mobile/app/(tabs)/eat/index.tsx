import { useRouter } from 'expo-router';

import { DayLogScreen } from '../../../src/eat/DayLogScreen';

export default function EatIndexRoute() {
  const router = useRouter();
  return <DayLogScreen onNavigate={(path) => router.push(path)} />;
}
