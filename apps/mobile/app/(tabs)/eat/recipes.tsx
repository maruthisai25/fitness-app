import { useRouter } from 'expo-router';

import { RecipesScreen } from '../../../src/eat/RecipesScreen';

export default function RecipesRoute() {
  const router = useRouter();
  return <RecipesScreen onNavigate={(path) => router.push(path)} />;
}
