import { useRouter } from 'expo-router';

import { MealPlansScreen } from '../../../src/eat/MealPlansScreen';

export default function MealPlansRoute() {
  const router = useRouter();
  return <MealPlansScreen onNavigate={(path) => router.push(path)} />;
}
