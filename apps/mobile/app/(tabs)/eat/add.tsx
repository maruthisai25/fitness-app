import { useRouter } from 'expo-router';

import { AddFoodScreen } from '../../../src/eat/AddFoodScreen';

export default function AddFoodRoute() {
  const router = useRouter();
  return <AddFoodScreen onDone={() => router.back()} />;
}
